import fs from "node:fs"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import { currentRequestOwner, assertRequestOwner } from "./request-ownership.mjs"
import { sourceFailureRetry, combineRetryFailures } from "./source-retry.mjs"

const queue = ".storage/development-pending/"
const hash = /^[a-f0-9]{64}$/
const repo = fileURLToPath(new URL("../../", import.meta.url))
const errorText = (value) =>
  String(value || "unknown failure")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/((?:access_token|api_key|client_secret|password)[=:]\s*)[^\s&"']+/gi, "$1[redacted]")
    .slice(0, 4000)
const install = (root, relative, bytes) => {
  try {
    atomicCreate(root, relative, bytes)
  } catch (error) {
    const file = safePath(root, relative, { materialize: false })
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) throw error
  }
}
const boundedRedacted = (value, bytes) => {
  const encoded = JSON.stringify(value ?? null)
  if (Buffer.byteLength(encoded) > bytes)
    throw Error("Defect reproduction/implementation payload exceeds budget")
  const redact = (entry) =>
    typeof entry === "string"
      ? errorText(entry)
      : Array.isArray(entry)
        ? entry.map(redact)
        : entry && typeof entry === "object"
          ? Object.fromEntries(
              Object.entries(entry).map(([key, value]) => [
                key,
                /token|secret|password|api.?key|authorization/i.test(key)
                  ? "[redacted]"
                  : redact(value),
              ]),
            )
          : entry
  return redact(JSON.parse(encoded))
}
const fileHash = (file) => {
  const digest = crypto.createHash("sha256"),
    fd = fs.openSync(file, "r"),
    chunk = Buffer.alloc(1024 * 1024)
  try {
    let n
    while ((n = fs.readSync(fd, chunk, 0, chunk.length, null))) digest.update(chunk.subarray(0, n))
  } finally {
    fs.closeSync(fd)
  }
  return digest.digest("hex")
}

// The operation preserves evidence; it never edits source code, retries work,
// calls a provider or changes release readiness.
export function recordDevelopmentDefect(
  ctx,
  { owner = currentRequestOwner(), stage, error, reproduction, evidence_paths = [] },
) {
  assertRequestOwner(ctx.root, owner)
  if (
    !owner ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(stage || "") ||
    !Array.isArray(evidence_paths) ||
    evidence_paths.length > 40
  )
    throw Error("Bound defect owner, stage and bounded evidence required")
  const jobPath = `module-jobs/${owner.job_id}/input.json`
  const input = readJSON(ctx.root, jobPath)
  const safeReproduction = boundedRedacted(reproduction, 64 * 1024)
  const implementation = boundedRedacted(input.implementation || {}, 128 * 1024)
  let remainingBytes = 64 * 1024 ** 2
  const component =
    stage === "collection"
      ? "scripts/research/daily-scan.mjs"
      : "scripts/research-module-worker.mjs"
  const code = { path: component, sha256: sha256(fs.readFileSync(safePath(ctx.repo, component))) }
  const capture = (relative) => {
    const target = safePath(ctx.root, relative, { materialize: false })
    if (relative.split("/").some((part) => /credential|oauth|secret/i.test(part)))
      return { path: relative, availability: "sensitive_excluded", sha256: null }
    if (!fs.existsSync(target)) return { path: relative, availability: "unavailable", sha256: null }
    const before = fs.statSync(target)
    if (!before.isFile()) throw Error("Defect evidence must be a regular file")
    const size = before.size
    if (size > remainingBytes) {
      const digest = fileHash(target),
        after = fs.statSync(target)
      if (after.size !== size || after.mtimeMs !== before.mtimeMs)
        throw Error("Defect evidence changed during capture")
      return {
        path: relative,
        availability: "reference_only",
        sha256: digest,
        bytes: size,
        reason: "snapshot_total_byte_budget",
        snapshot: null,
      }
    }
    const bytes = fs.readFileSync(target),
      digest = sha256(bytes)
    const after = fs.statSync(target)
    if (after.size !== size || after.mtimeMs !== before.mtimeMs)
      throw Error("Defect evidence changed during capture")
    remainingBytes -= size
    const destination = queue + "artifacts/" + digest + ".bin"
    const stored = safePath(ctx.root, destination, { materialize: false })
    if (!fs.existsSync(stored)) install(ctx.root, destination, bytes)
    else if (sha256(fs.readFileSync(stored)) !== digest) throw Error("Defect snapshot changed")
    return {
      path: relative,
      availability: "preserved",
      sha256: digest,
      bytes: bytes.length,
      snapshot: { path: destination, sha256: digest },
    }
  }
  const evidence = [...new Set([jobPath, ...evidence_paths])].map(capture)
  const body = {
    schema: "research-development-pending/v1",
    status: "development_pending",
    owner,
    stage,
    code,
    implementation,
    error: {
      message: errorText(error?.message || error),
      code: /^[A-Z0-9_]{1,80}$/.test(error?.code || "") ? error.code : null,
    },
    reproduction: safeReproduction,
    evidence,
    snapshot_byte_budget: 64 * 1024 ** 2,
    automatic_retry: false,
    code_modified: false,
    operation_resumed: false,
  }
  const id = sha256(JSON.stringify(body)),
    relative = queue + "issues/" + id + ".json"
  const old = readJSON(ctx.root, relative)
  if (!old)
    install(
      ctx.root,
      relative,
      Buffer.from(JSON.stringify({ ...body, issue_id: id }, null, 2) + "\n"),
    )
  else if (
    old.issue_id !== id ||
    sha256(
      JSON.stringify(Object.fromEntries(Object.entries(old).filter(([key]) => key !== "issue_id"))),
    ) !== id
  )
    throw Error("Development pending issue changed")
  return {
    status: "development_pending",
    issue_id: id,
    reference: { path: relative, sha256: sha256(fs.readFileSync(safePath(ctx.root, relative))) },
    reused: Boolean(old),
    automatic_retry: false,
  }
}

export function recordJobDevelopmentFailure(ctx, input, state, error) {
  const owner = {
    job_id: input.job_id,
    input_sha256: state.input_sha256,
    ...(ctx.operationalRound || {}),
  }
  const evidence_paths = [
    `module-jobs/${input.job_id}/state.json`,
    ...(input.files || []).filter((f) => f.scope === "root").map((f) => f.path),
  ]
  for (const run of [input.parameters.run_id, input.parameters.source_run]) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "")) continue
    const documentsPath = `runs/${run}/documents.json`
    const documents = readJSON(ctx.root, documentsPath)
    if (Array.isArray(documents)) {
      evidence_paths.push(documentsPath)
      for (const document of documents)
        if (document.body_path) evidence_paths.push(document.body_path)
    }
  }
  return recordDevelopmentDefect(ctx, {
    owner,
    stage: input.module,
    error,
    reproduction: {
      module: input.module,
      operation: input.operation,
      attempt: state.attempt,
      input: {
        path: `module-jobs/${input.job_id}/input.json`,
        sha256: sha256(
          fs.readFileSync(safePath(ctx.root, `module-jobs/${input.job_id}/input.json`)),
        ),
      },
    },
    evidence_paths,
  })
}

export function developmentPendingStatus(root, { round_id, offset = 0, limit = 20 } = {}) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("Bounded defect page required")
  const directory = safePath(root, queue + "issues", { materialize: false })
  const records = (fs.existsSync(directory) ? fs.readdirSync(directory) : [])
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .sort()
    .map((name) => {
      const row = readJSON(root, queue + "issues/" + name)
      const { issue_id, ...body } = row
      if (
        !hash.test(issue_id || "") ||
        issue_id + ".json" !== name ||
        sha256(JSON.stringify(body)) !== issue_id
      )
        throw Error("Development pending issue SHA changed")
      for (const evidence of row.evidence)
        if (
          evidence.snapshot &&
          sha256(fs.readFileSync(safePath(root, evidence.snapshot.path))) !==
            evidence.snapshot.sha256
        )
          throw Error("Development pending evidence changed")
      return row
    })
    .filter((row) => !round_id || row.owner.round_id === round_id)
  return {
    status: records.length ? "development_pending" : "idle",
    total: records.length,
    issues: records.slice(offset, offset + limit),
    next_offset: offset + limit < records.length ? offset + limit : null,
    automatic_retry: false,
    code_modified: false,
  }
}

export function collectionFailureAssessment(result, error) {
  if (error?.code === "STORAGE_PENDING") return { state: "waiting_for_storage", kind: "storage" }
  const failures = (result?.documents || [])
    .map((doc) =>
      sourceFailureRetry(
        doc,
        (result?.parses || []).find((p) => p.source_version_id === doc.source_version_id),
      ),
    )
    .filter((row) => row.state !== undefined)
  return failures.length
    ? combineRetryFailures(failures)
    : sourceFailureRetry({
        fetch_status: "failed",
        error: `${error?.code || ""} ${error?.message || error || ""}`,
      })
}
export function recordCollectionDefect(
  root,
  { run_id, attempt_id, window, receipt, result, error, assessment },
) {
  const owner = currentRequestOwner()
  if (!owner?.round_id) return null
  assessment ||= collectionFailureAssessment(result, error)
  if (error?.code === "STORAGE_PENDING" || assessment.state !== "requires_repair") return null
  const paths = [receipt.path, `daily/runs/${run_id}/plan.json`]
  for (const name of ["state.json", "documents.json", "list-pages.json", "summary.json"])
    if (fs.existsSync(safePath(root, `runs/${attempt_id}/${name}`, { materialize: false })))
      paths.push(`runs/${attempt_id}/${name}`)
  let documents = result?.documents || readJSON(root, `runs/${attempt_id}/documents.json`) || []
  for (const doc of documents) if (doc.body_path) paths.push(doc.body_path)
  for (const parsed of result?.parses || [])
    if (parsed.parse_id) paths.push(`parses/${parsed.parse_id}/parse.json`)
  return recordDevelopmentDefect(
    { root, repo },
    {
      owner,
      stage: "collection",
      error,
      reproduction: { run_id, attempt_id, window, receipt, assessment },
      evidence_paths: [...new Set(paths)],
    },
  )
}
