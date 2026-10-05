import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { sha256 } from "./contracts.mjs"
import { compareAuthoringRemote } from "./authoring-transfer.mjs"
import { materializeAuthoringReadback, storeAuthoringReadback } from "./authoring-readback.mjs"
import {
  atomicCreate,
  readJSON,
  safePath,
  withGardenOperationLock,
  withLock,
} from "./run-state.mjs"

const hash = (v) => /^[a-f0-9]{64}$/.test(v || "")
const jsonBytes = (v) => Buffer.from(JSON.stringify(v, null, 2) + "\n")

function loadRelease(root, relative) {
  const bytes = fs.readFileSync(safePath(root, relative)),
    release = JSON.parse(bytes)
  const run = release.preview_run
  if (
    !/^[A-Za-z0-9_-]+$/.test(run || "") ||
    release.schema !== "research-authoring-release/v1" ||
    release.release_approved !== true ||
    release.upload_allowed !== true ||
    Object.keys(release.input_sha256 || {})
      .sort()
      .join() !== "manifest,observation,plan,review,snapshot" ||
    !Object.values(release.input_sha256).every(hash) ||
    relative !==
      `runs/${run}/drive-authoring/releases/${sha256(JSON.stringify(release.input_sha256))}.json`
  )
    throw Error("Pinned approved authoring release required")
  const base = `runs/${run}/drive-authoring`
  const planBytes = fs.readFileSync(safePath(root, base + "/transfer-plan.json"))
  const manifestBytes = fs.readFileSync(safePath(root, `runs/${run}/preview-manifest.json`))
  const plan = JSON.parse(planBytes)
  if (
    sha256(planBytes) !== release.input_sha256.plan ||
    sha256(manifestBytes) !== release.input_sha256.manifest ||
    plan.preview_sha256 !== release.input_sha256.manifest ||
    plan.preview_run !== run ||
    !Array.isArray(plan.files) ||
    !plan.files.length ||
    !Array.isArray(release.operations) ||
    release.operations.length !== plan.files.length
  )
    throw Error("Approved release inputs changed")
  for (const [i, row] of plan.files.entries()) {
    const op = release.operations[i]
    if (
      row.staged_path !== `${base}/files/${row.path}` ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 1 ||
      op.path !== row.path ||
      op.desired_sha256 !== row.sha256 ||
      ![row.operation, "already_applied"].includes(op.action) ||
      (op.action === "create"
        ? op.file_id !== null || op.expected_sha256 !== null || op.modified_at !== null
        : !op.file_id ||
          !hash(op.expected_sha256) ||
          !Number.isFinite(Date.parse(op.modified_at))) ||
      (op.action === "update" && op.expected_sha256 !== row.previous_sha256) ||
      (op.action === "already_applied" && op.expected_sha256 !== row.sha256) ||
      !op.parent_id
    )
      throw Error("Release operations differ from the approved transfer")
    const staged = fs.readFileSync(safePath(root, row.staged_path))
    if (staged.length !== row.bytes || sha256(staged) !== row.sha256)
      throw Error("Staged authoring bytes changed")
  }
  return { release, plan, base, release_sha256: sha256(bytes) }
}

export async function stageAuthoringReadback({
  root,
  releasePath,
  acquisitionFile,
  now = Date.now(),
}) {
  return withGardenOperationLock(root, () =>
    withLock(root, "authoring-execution", async () => {
      const binding = loadRelease(root, releasePath)
      const captured = materializeAuthoringReadback(root, binding, acquisitionFile, now)
      assessAuthoringExecution({ ...binding, ...captured, now })
      return storeAuthoringReadback(root, captured)
    }),
  )
}

// Inspect actual remote bytes, not API success messages. No network write occurs here.
export function assessAuthoringExecution({
  plan,
  release,
  observation,
  readback,
  rawFiles,
  priorBindings = new Map(),
  now = Date.now(),
}) {
  if (
    readback?.schema !== "research-authoring-readback/v1" ||
    readback.observed_at !== observation?.observed_at ||
    !Array.isArray(readback.files) ||
    Date.parse(observation.observed_at) > now
  )
    throw Error("Matching fresh raw Drive readback required")
  // Validate the entire folder/list identity even when individual targets conflict.
  compareAuthoringRemote({ ...plan, files: [] }, observation, { now })
  const current = new Map(),
    proofs = new Map(),
    declared = new Set(plan.files.map((r) => r.path))
  for (const listing of observation.listings)
    for (const file of listing.files) current.set(listing.path + "/" + file.name, file)
  for (const proof of readback.files) {
    const file = current.get(proof.path),
      raw = rawFiles.get(proof.path)
    if (
      !declared.has(proof.path) ||
      proofs.has(proof.path) ||
      !file ||
      !Buffer.isBuffer(raw) ||
      proof.file_id !== file.id ||
      proof.parent_id !== file.parent_id ||
      proof.modified_at !== file.modified_at ||
      Date.parse(proof.modified_at) > Date.parse(observation.observed_at) ||
      proof.shared !== false ||
      !["text/plain", "text/markdown", "text/x-markdown"].includes(proof.mime_type) ||
      !Number.isSafeInteger(proof.bytes) ||
      proof.bytes !== raw.length ||
      !hash(proof.sha256) ||
      sha256(raw) !== proof.sha256 ||
      file.sha256 !== proof.sha256
    )
      throw Error("Drive raw bytes or metadata do not match: " + proof.path)
    proofs.set(proof.path, proof)
  }
  if (rawFiles.size !== proofs.size) throw Error("Undeclared raw Drive bytes")
  const rows = plan.files.map((row, i) => {
    const pinned = release.operations[i],
      file = current.get(row.path)
    if (file && !proofs.has(row.path)) throw Error("Raw Drive readback missing: " + row.path)
    const expectedID = priorBindings.get(row.path) || pinned.file_id
    let operation, reason
    try {
      operation = compareAuthoringRemote({ ...plan, files: [row] }, observation, { now })
        .operations[0]
      if (operation.parent_id !== pinned.parent_id) reason = "parent_changed"
      else if (expectedID && operation.file_id !== expectedID) reason = "file_identity_changed"
      else if (pinned.action === "already_applied" && operation.action !== "already_applied")
        reason = "applied_content_changed"
      else if (operation.action === "update" && operation.modified_at !== pinned.modified_at)
        reason = "revision_changed"
    } catch (error) {
      if (!error.message.startsWith("Drive authoring conflict:")) throw error
      reason = "remote_content_changed"
    }
    return {
      path: row.path,
      status: reason ? "conflict" : operation.action === "already_applied" ? "verified" : "pending",
      file_id: file?.id || null,
      parent_id: pinned.parent_id,
      desired_sha256: row.sha256,
      observed_sha256: file?.sha256 || null,
      ...(reason ? { reason } : { operation }),
    }
  })
  const counts = Object.fromEntries(
    ["verified", "pending", "conflict"].map((s) => [s, rows.filter((r) => r.status === s).length]),
  )
  return {
    status: counts.conflict ? "conflict" : counts.pending ? "pending" : "verified_complete",
    counts,
    rows,
    next_operations: counts.conflict
      ? []
      : rows.filter((r) => r.status === "pending").map((r) => r.operation),
    drive_verified: counts.verified === rows.length,
    // Readback proves presence; it does not prove which process performed a write.
    drive_written: false,
    write_performed: false,
    candidate_published: false,
    public_deployment_verified: false,
    new_operational_run: false,
  }
}

function inspectStoredExecution(root, relative, binding) {
  const receipt = readJSON(root, relative)
  if (
    receipt?.schema !== "research-authoring-execution/v1" ||
    (receipt.sequence !== undefined &&
      (!Number.isSafeInteger(receipt.sequence) || receipt.sequence < 1)) ||
    receipt.release_sha256 !== binding.release_sha256 ||
    receipt.release_path !== binding.release_path ||
    relative !==
      `${binding.base}/executions/${binding.release_sha256}/${receipt.input_sha256}/receipt.json`
  )
    throw Error("Invalid authoring execution receipt")
  const directory = path.posix.dirname(relative)
  const observationBytes = fs.readFileSync(safePath(root, directory + "/observation.json"))
  const readbackBytes = fs.readFileSync(safePath(root, directory + "/readback.json"))
  const observation = JSON.parse(observationBytes),
    readback = JSON.parse(readbackBytes)
  const rawFiles = new Map(
    readback.files.map((r, i) => [
      r.path,
      fs.readFileSync(safePath(root, directory + `/raw/${i}.bin`)),
    ]),
  )
  const expectedHash = sha256(
    JSON.stringify({
      release: binding.release_sha256,
      observation: sha256(observationBytes),
      readback: sha256(readbackBytes),
    }),
  )
  if (
    expectedHash !== receipt.input_sha256 ||
    receipt.observed_at !== observation.observed_at ||
    receipt.valid_until !== new Date(Date.parse(observation.observed_at) + 600000).toISOString()
  )
    throw Error("Stored authoring observation changed")
  // Reasons involving prior history are checked separately; raw proof must still replay.
  const replay = assessAuthoringExecution({
    ...binding,
    observation,
    readback,
    rawFiles,
    now: Date.parse(observation.observed_at),
  })
  if (
    !Array.isArray(receipt.rows) ||
    receipt.rows.length !== replay.rows.length ||
    receipt.rows.some(
      (r, i) =>
        r.path !== replay.rows[i].path ||
        r.file_id !== replay.rows[i].file_id ||
        r.observed_sha256 !== replay.rows[i].observed_sha256 ||
        r.desired_sha256 !== replay.rows[i].desired_sha256 ||
        (r.status !== "conflict" && JSON.stringify(r) !== JSON.stringify(replay.rows[i])),
    ) ||
    JSON.stringify(receipt.counts) !==
      JSON.stringify(
        Object.fromEntries(
          ["verified", "pending", "conflict"].map((s) => [
            s,
            receipt.rows.filter((r) => r.status === s).length,
          ]),
        ),
      ) ||
    receipt.drive_verified !== receipt.rows.every((r) => r.status === "verified") ||
    receipt.status !==
      (receipt.counts.conflict
        ? "conflict"
        : receipt.counts.pending
          ? "pending"
          : "verified_complete") ||
    JSON.stringify(receipt.next_operations) !==
      JSON.stringify(
        receipt.counts.conflict
          ? []
          : receipt.rows.filter((r) => r.status === "pending").map((r) => r.operation),
      ) ||
    [
      "drive_written",
      "write_performed",
      "candidate_published",
      "public_deployment_verified",
      "new_operational_run",
    ].some((k) => receipt[k] !== false)
  )
    throw Error("Stored authoring result changed")
  return receipt
}

function executionFiles(root, binding) {
  const relative = `${binding.base}/executions/${binding.release_sha256}`
  const directory = safePath(root, relative)
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      if (!hash(e.name)) throw Error("Invalid authoring execution directory")
      const file = `${relative}/${e.name}/receipt.json`
      // Interrupted receipt installation is not treated as a completed execution.
      return fs.existsSync(safePath(root, file))
        ? { path: file, receipt: inspectStoredExecution(root, file, binding) }
        : null
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        (a.receipt.sequence || 0) - (b.receipt.sequence || 0) ||
        Date.parse(a.receipt.observed_at) - Date.parse(b.receipt.observed_at),
    )
}

export async function reconcileAuthoringExecution({
  root,
  releasePath,
  observationFile,
  readbackFile,
  now = Date.now(),
}) {
  return withGardenOperationLock(root, () =>
    withLock(root, "authoring-execution", () =>
      reconcileExecutionLocked({ root, releasePath, observationFile, readbackFile, now }),
    ),
  )
}

async function reconcileExecutionLocked({ root, releasePath, observationFile, readbackFile, now }) {
  const binding = { ...loadRelease(root, releasePath), release_path: releasePath }
  const observationBytes = fs.readFileSync(observationFile),
    readbackBytes = fs.readFileSync(readbackFile)
  const observation = JSON.parse(observationBytes),
    readback = JSON.parse(readbackBytes)
  const rawFiles = new Map(
    (readback.files || []).map((r) => [r.path, fs.readFileSync(safePath(root, r.raw_path))]),
  )
  const previous = executionFiles(root, binding),
    priorBindings = new Map()
  for (const { receipt } of previous) {
    if (Date.parse(receipt.observed_at) > Date.parse(observation.observed_at))
      throw Error("Observation predates the saved execution")
    for (const row of receipt.rows.filter((r) => r.status === "verified")) {
      if (priorBindings.has(row.path) && priorBindings.get(row.path) !== row.file_id)
        throw Error("Saved authoring identity conflict")
      priorBindings.set(row.path, row.file_id)
    }
  }
  const result = assessAuthoringExecution({
    ...binding,
    observation,
    readback,
    rawFiles,
    priorBindings,
    now,
  })
  const inputHash = sha256(
    JSON.stringify({
      release: binding.release_sha256,
      observation: sha256(observationBytes),
      readback: sha256(readbackBytes),
    }),
  )
  const directory = `${binding.base}/executions/${binding.release_sha256}/${inputHash}`
  const existing = readJSON(root, directory + "/receipt.json")
  if (existing) {
    const stored = inspectStoredExecution(root, directory + "/receipt.json", binding)
    if (
      Object.keys(result).some((key) => JSON.stringify(result[key]) !== JSON.stringify(stored[key]))
    )
      throw Error("Saved observation conflicts with subsequent execution evidence")
    return { ...stored, receipt: directory + "/receipt.json" }
  }
  const receipt = {
    schema: "research-authoring-execution/v1",
    preview_run: binding.release.preview_run,
    release_path: releasePath,
    release_sha256: binding.release_sha256,
    input_sha256: inputHash,
    observed_at: observation.observed_at,
    sequence: Math.max(0, ...previous.map((r) => r.receipt.sequence || 0)) + 1,
    valid_until: new Date(Date.parse(observation.observed_at) + 600000).toISOString(),
    ...result,
  }
  const install = (file, bytes) => {
    const absolute = safePath(root, file)
    if (!fs.existsSync(absolute)) atomicCreate(root, file, bytes)
    else if (!fs.readFileSync(absolute).equals(bytes))
      throw Error("Authoring execution evidence changed")
  }
  install(directory + "/observation.json", observationBytes)
  install(directory + "/readback.json", readbackBytes)
  readback.files.forEach((r, i) => install(directory + `/raw/${i}.bin`, rawFiles.get(r.path)))
  install(directory + "/receipt.json", jsonBytes(receipt))
  return {
    ...inspectStoredExecution(root, directory + "/receipt.json", binding),
    receipt: directory + "/receipt.json",
  }
}

const targetKey = (op) => sha256(JSON.stringify([op.parent_id, path.posix.basename(op.path)]))

function executionProof(root, relative) {
  const receipt = readJSON(root, relative)
  const binding = {
    ...loadRelease(root, receipt?.release_path),
    release_path: receipt.release_path,
  }
  const verified = inspectStoredExecution(root, relative, binding)
  return {
    receipt: verified,
    readback: readJSON(root, path.posix.dirname(relative) + "/readback.json"),
  }
}

function targetProof(proof, intent) {
  const file = proof.readback.files.find((r) => targetKey(r) === targetKey(intent.operation))
  if (
    !file ||
    file.sha256 !== intent.operation.desired_sha256 ||
    (intent.operation.file_id && file.file_id !== intent.operation.file_id) ||
    Date.parse(proof.receipt.observed_at) < Date.parse(intent.started_at) ||
    Date.parse(file.modified_at) < Date.parse(intent.started_at)
  )
    return null
  return file
}

function inspectWriteIntent(root, relative) {
  const bytes = fs.readFileSync(safePath(root, relative)),
    intent = JSON.parse(bytes)
  if (
    intent?.schema !== "research-authoring-write-intent/v1" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(intent.attempt_id || "") ||
    !Number.isSafeInteger(intent.pid) ||
    intent.pid < 1 ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(intent.lock_owner || "") ||
    !Number.isFinite(Date.parse(intent.started_at)) ||
    relative !==
      `authoring-write-intents/${targetKey(intent.operation)}/${intent.attempt_id}/intent.json`
  )
    throw Error("Invalid authoring write intent")
  const binding = { ...loadRelease(root, intent.release_path), release_path: intent.release_path }
  const proof = inspectStoredExecution(root, intent.execution_receipt, binding)
  if (
    intent.release_sha256 !== binding.release_sha256 ||
    intent.execution_sha256 !== sha256(fs.readFileSync(safePath(root, intent.execution_receipt))) ||
    !proof.next_operations.some((op) => JSON.stringify(op) === JSON.stringify(intent.operation)) ||
    Date.parse(intent.started_at) < Date.parse(proof.observed_at) ||
    Date.parse(intent.started_at) > Date.parse(proof.valid_until)
  )
    throw Error("Write intent differs from the approved fresh operation")
  const resolutionPath = path.posix.dirname(relative) + "/resolution.json"
  const resolution = readJSON(root, resolutionPath)
  if (resolution) {
    const remote = executionProof(root, resolution.execution_receipt),
      file = targetProof(remote, intent)
    if (
      resolution.schema !== "research-authoring-write-resolution/v1" ||
      resolution.intent_sha256 !== sha256(bytes) ||
      resolution.execution_sha256 !==
        sha256(fs.readFileSync(safePath(root, resolution.execution_receipt))) ||
      !file ||
      resolution.file_id !== file.file_id ||
      resolution.observed_at !== remote.receipt.observed_at
    )
      throw Error("Write resolution lacks matching post-write raw evidence")
  }
  return { path: relative, intent, sha256: sha256(bytes), resolved: Boolean(resolution) }
}

function writeIntents(root) {
  const directory = safePath(root, "authoring-write-intents"),
    entries = []
  if (!fs.existsSync(directory)) return entries
  for (const target of fs.readdirSync(directory)) {
    if (!hash(target)) throw Error("Invalid authoring write target")
    const base = "authoring-write-intents/" + target
    for (const attempt of fs.readdirSync(safePath(root, base)))
      entries.push(inspectWriteIntent(root, `${base}/${attempt}/intent.json`))
  }
  return entries
}

function resolveWriteIntents(root, receiptPath) {
  const proof = executionProof(root, receiptPath),
    recovered = []
  for (const entry of writeIntents(root).filter((r) => !r.resolved)) {
    const file = targetProof(proof, entry.intent)
    if (!file) continue
    const resolutionPath = path.posix.dirname(entry.path) + "/resolution.json"
    atomicCreate(root, resolutionPath, {
      schema: "research-authoring-write-resolution/v1",
      intent_sha256: entry.sha256,
      execution_receipt: receiptPath,
      execution_sha256: sha256(fs.readFileSync(safePath(root, receiptPath))),
      file_id: file.file_id,
      observed_at: proof.receipt.observed_at,
    })
    recovered.push(entry.path)
  }
  return recovered
}

export function assertNoUnresolvedAuthoringWrites(root) {
  if (writeIntents(root).some((r) => !r.resolved))
    throw Error("Unconfirmed Drive writes must be reconciled before publication")
}

export function loadAuthoringWriteStatus(root) {
  try {
    const entries = writeIntents(root),
      lock = readJSON(root, "locks/garden-operation.json")
    return {
      status: "read_only_write_intent_audit",
      verified: entries.filter((r) => r.resolved).length,
      unresolved: entries.filter((r) => !r.resolved).length,
      entries: entries.map((r) => ({
        intent_path: r.path,
        path: r.intent.operation.path,
        resolved: r.resolved,
        owner_pid: r.intent.pid,
        lock_owned: lock?.owner === r.intent.lock_owner && lock?.pid === r.intent.pid,
      })),
    }
  } catch (error) {
    return { status: "invalid", unresolved: null, reason: error.message }
  }
}

// The signed-in caller performs connector writes; this process guards and journals them.
export async function authoringWriteSession({
  root,
  releasePath,
  acquisitionFile,
  nextCapture,
  emit = () => {},
  now = Date.now,
  waitMs = 300000,
  resumeIntent = null,
}) {
  if (
    typeof nextCapture !== "function" ||
    !Number.isSafeInteger(waitMs) ||
    waitMs < 1 ||
    waitMs > 600000
  )
    throw Error("Bounded post-write capture callback required")
  return withGardenOperationLock(root, () =>
    withLock(root, "authoring-execution", async () => {
      const binding = loadRelease(root, releasePath)
      const capture = async (file) => {
        const current = materializeAuthoringReadback(root, binding, file, now())
        assessAuthoringExecution({ ...binding, ...current, now: now() })
        const staged = storeAuthoringReadback(root, current)
        return reconcileExecutionLocked({
          root,
          releasePath,
          observationFile: staged.observation_file,
          readbackFile: staged.readback_file,
          now: now(),
        })
      }
      let receipt = await capture(acquisitionFile)
      const recovered = resolveWriteIntents(root, receipt.receipt),
        created = [],
        resumed = []
      const sessionID = crypto.randomUUID()
      let resume = null
      if (resumeIntent) {
        const pending = writeIntents(root).filter((r) => !r.resolved)
        const selected = pending.find((r) => r.path === resumeIntent)
        if (selected) {
          const original = selected.intent
          if (
            pending.length !== 1 ||
            original.release_path !== releasePath ||
            original.operation.action !== "update" ||
            !original.operation.file_id ||
            Date.parse(receipt.observed_at) < Date.parse(original.started_at) ||
            JSON.stringify(receipt.next_operations[0]) !== JSON.stringify(original.operation)
          )
            throw Error("Explicit resume requires the unchanged existing file and original update")
          try {
            process.kill(original.pid, 0)
          } catch (error) {
            if (error.code !== "ESRCH") throw error
            resume = selected
          }
          if (!resume) throw Error("Previous authoring writer is still live")
        } else if (!recovered.includes(resumeIntent)) {
          throw Error("Unresolved original write intent required")
        }
      }
      const finish = (status) => {
        const result = {
          schema: "research-authoring-write-session/v1",
          session_id: sessionID,
          release_path: releasePath,
          release_sha256: binding.release_sha256,
          status,
          execution_receipt: receipt.receipt,
          counts: receipt.counts,
          created_intents: created,
          recovered_intents: recovered,
          resumed_intents: resumed,
          unresolved_intents: writeIntents(root)
            .filter((r) => !r.resolved)
            .map((r) => r.path),
          drive_verified: status === "verified_complete",
          write_performed: false,
          automatic_retry: false,
          candidate_published: false,
          new_operational_run: false,
        }
        const relative = `${binding.base}/write-sessions/${sessionID}.json`
        atomicCreate(root, relative, result)
        return { ...result, receipt: relative }
      }
      // Even an absent target can be a late in-flight create; absence never cancels an intent.
      if (!resume && writeIntents(root).some((r) => !r.resolved))
        return finish("write_outcome_unknown")
      while (receipt.status === "pending") {
        if (now() >= Date.parse(receipt.valid_until))
          throw Error("Fresh pre-write acquisition required")
        const operation = receipt.next_operations[0],
          attempt = crypto.randomUUID()
        const lock = readJSON(root, "locks/garden-operation.json")
        if (lock?.pid !== process.pid) throw Error("Authoring write lock owner changed")
        const relative = resume
          ? resume.path
          : `authoring-write-intents/${targetKey(operation)}/${attempt}/intent.json`
        const intent = resume
          ? resume.intent
          : {
              schema: "research-authoring-write-intent/v1",
              attempt_id: attempt,
              release_path: releasePath,
              release_sha256: binding.release_sha256,
              execution_receipt: receipt.receipt,
              execution_sha256: sha256(fs.readFileSync(safePath(root, receipt.receipt))),
              operation,
              started_at: new Date(now()).toISOString(),
              pid: process.pid,
              lock_owner: lock.owner,
            }
        const isResume = Boolean(resume)
        if (isResume) {
          atomicCreate(root, path.posix.dirname(relative) + `/resumptions/${sessionID}.json`, {
            schema: "research-authoring-update-resumption/v1",
            intent_path: relative,
            intent_sha256: resume.sha256,
            execution_receipt: receipt.receipt,
            execution_sha256: sha256(fs.readFileSync(safePath(root, receipt.receipt))),
            observed_at: receipt.observed_at,
            resumed_at: new Date(now()).toISOString(),
            pid: process.pid,
            lock_owner: lock.owner,
            automatic_retry: false,
          })
          resumed.push(relative)
          resume = null
        } else {
          atomicCreate(root, relative, intent)
          created.push(relative)
        }
        const row = binding.plan.files.find((r) => r.path === operation.path)
        emit({
          type: "write_intent",
          intent_path: relative,
          attempt_id: intent.attempt_id,
          resumed: isResume,
          operation,
          file_uri: safePath(root, row.staged_path),
          expires_at: receipt.valid_until,
          require_post_write_capture: true,
        })
        let timer
        try {
          const postFile = await Promise.race([
            Promise.resolve().then(() => nextCapture(intent)),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(Error("Post-write capture timed out")),
                Math.min(waitMs, Date.parse(receipt.valid_until) - now()),
              )
            }),
          ])
          receipt = await capture(postFile)
          const resolved = resolveWriteIntents(root, receipt.receipt)
          if (!resolved.includes(relative))
            return finish(receipt.status === "conflict" ? "conflict" : "write_outcome_unknown")
        } catch (error) {
          atomicCreate(
            root,
            path.posix.dirname(relative) +
              (isResume ? `/resumptions/${sessionID}-interruption.json` : "/interruption.json"),
            {
              schema: "research-authoring-write-interruption/v1",
              intent_path: relative,
              stopped_at: new Date(now()).toISOString(),
              status: "write_outcome_unknown",
            },
          )
          throw Error("Drive write outcome unknown; durable intent preserved", { cause: error })
        } finally {
          clearTimeout(timer)
        }
      }
      return finish(receipt.status)
    }),
  )
}

// Historical proof is distinct from a fresh remote observation or public deployment.
export function loadAuthoringExecutionStatus(root) {
  const runs = safePath(root, "runs"),
    entries = []
  if (!fs.existsSync(runs)) return { status: "missing", releases: [] }
  for (const run of fs
    .readdirSync(runs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[A-Za-z0-9_-]+$/.test(e.name))) {
    const directory = `runs/${run.name}/drive-authoring/releases`
    if (!fs.existsSync(safePath(root, directory))) continue
    for (const name of fs
      .readdirSync(safePath(root, directory))
      .filter((n) => n.endsWith(".json"))) {
      const releasePath = directory + "/" + name
      try {
        const binding = { ...loadRelease(root, releasePath), release_path: releasePath }
        const latest = executionFiles(root, binding).at(-1)
        entries.push({
          preview_run: run.name,
          release_path: releasePath,
          status: latest?.receipt.status || "readback_required",
          receipt: latest?.path || null,
          observed_at: latest?.receipt.observed_at || null,
          counts: latest?.receipt.counts || null,
          drive_verified_at_observation: latest?.receipt.drive_verified === true,
          remote_current_verified: false,
          public_deployment_verified: false,
        })
      } catch (error) {
        entries.push({
          preview_run: run.name,
          release_path: releasePath,
          status: "invalid",
          reason: error.message,
        })
      }
    }
  }
  return {
    status: "read_only_authoring_execution_audit",
    releases: entries,
    write_intents: loadAuthoringWriteStatus(root),
  }
}
