import fs from "node:fs"
import path from "node:path"
import { buildArchiveClosure } from "./archive-closure.mjs"
import { loadApprovedOntologyInput } from "./ontology.mjs"
import { storeParseArtifact } from "./parser.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const runId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)

// Reuse the existing explicit dependency closure without creating a ZIP or
// uploading it. Transfer immutable native evidence, not an approval decision.
function prepare(sourceRoot, root, run, approvedRun, relatedRuns, vault) {
  const approval = loadApprovedOntologyInput(sourceRoot, approvedRun, { vault })
  const manifest = buildArchiveClosure(sourceRoot, run, approvedRun, relatedRuns, { vault })
  for (const run of manifest.bound_runs)
    for (const base of [sourceRoot, root])
      for (const file of ["state.json", "processing/state.json"]) {
        const state = readJSON(base, `runs/${run}/${file}`)
        if (
          state?.status === "running" ||
          Object.values(state?.stages || {}).some((stage) => stage.status === "running")
        )
          throw Error("Native import requires terminal source and destination checkpoints")
      }
  const files = manifest.files.map((entry) => {
    const source = fs.readFileSync(safePath(sourceRoot, entry.path))
    if (source.length !== entry.bytes || sha256(source) !== entry.sha256)
      throw Error("Native import source differs from its dependency closure")
    const destination = safePath(root, entry.path)
    let reusedParse = null
    if (fs.existsSync(destination)) {
      const bytes = fs.readFileSync(destination)
      if (sha256(bytes) !== entry.sha256) {
        if (!/^parses\/[a-f0-9]{64}\/parse\.json$/.test(entry.path))
          throw Error("Native import destination conflict: " + entry.path)
        // Canonical parses share immutable content across observations. Use the
        // same parser rule as acquisition; keep each run's exact observed time.
        storeParseArtifact(root, JSON.parse(source))
        reusedParse = { bytes: bytes.length, sha256: sha256(bytes) }
      }
    }
    return {
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
      ...(reusedParse ? { reused_parse: reusedParse } : {}),
    }
  })
  return {
    schema: "research-native-approval-import-input/v1",
    source_root: fs.realpathSync(sourceRoot),
    destination_root: path.resolve(root),
    approved_run: approvedRun,
    related_runs: relatedRuns,
    event_id: approval.article.event_id,
    approval_files: approval.file_hashes,
    closure_sha256: sha256(JSON.stringify(manifest)),
    bound_runs: manifest.bound_runs,
    files,
    implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    parser_sha256: sha256(fs.readFileSync(new URL("./parser.mjs", import.meta.url))),
  }
}

async function underRunLocks(sourceRoot, root, runs, action) {
  const targets = runs
    .flatMap((run) => [
      [sourceRoot, run],
      [root, run],
    ])
    .sort((a, b) => (a[0] + "/" + a[1]).localeCompare(b[0] + "/" + b[1]))
  const next = (index) =>
    index === targets.length
      ? action()
      : withLock(targets[index][0], "run-" + targets[index][1], () => next(index + 1))
  return next(0)
}

export async function importNativeApproval({
  sourceRoot,
  root,
  run,
  approvedRun,
  relatedRuns = [],
  vault = "vault",
  execute = false,
}) {
  if (
    !runId(run) ||
    !runId(approvedRun) ||
    run === approvedRun ||
    !Array.isArray(relatedRuns) ||
    relatedRuns.some((id) => !runId(id)) ||
    path.resolve(sourceRoot) === path.resolve(root)
  )
    throw Error("Distinct native source/destination roots and safe import run required")
  sourceRoot = path.resolve(sourceRoot)
  root = path.resolve(root)
  // Resolve private paths before looking up the approval or taking locks.
  safePath(sourceRoot, `runs/${approvedRun}/approved-article.json`)
  safePath(root, `imports/${run}/input.json`)
  const plan = prepare(sourceRoot, root, run, approvedRun, relatedRuns, vault)
  if (!execute) return { ...plan, status: "planned", candidate_published: false }
  return withLock(root, "native-import-" + run, () =>
    underRunLocks(sourceRoot, root, plan.bound_runs, async () => {
      if (!same(plan, prepare(sourceRoot, root, run, approvedRun, relatedRuns, vault)))
        throw Error("Native import source or destination changed before execution")
      await assertProcessedFactReview(
        sourceRoot,
        approvedRun,
        readJSON(sourceRoot, `runs/${approvedRun}/reviewed-claims.json`),
      )
      const base = `imports/${run}/`
      const priorInput = readJSON(root, base + "input.json")
      if (priorInput && !same(priorInput, plan))
        throw Error("Native import input changed; use a new run")
      if (!priorInput) atomicCreate(root, base + "input.json", plan)
      let copied = 0,
        reused = 0
      for (const entry of plan.files) {
        const bytes = fs.readFileSync(safePath(sourceRoot, entry.path))
        if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
          throw Error("Native import source changed during transfer")
        const target = safePath(root, entry.path)
        if (fs.existsSync(target)) {
          if (sha256(fs.readFileSync(target)) !== (entry.reused_parse?.sha256 || entry.sha256))
            throw Error("Native import destination conflict: " + entry.path)
          reused++
        } else {
          atomicCreate(root, entry.path, bytes)
          copied++
        }
      }
      if (!same(plan, prepare(sourceRoot, root, run, approvedRun, relatedRuns, vault)))
        throw Error("Native import evidence changed before acceptance")
      const imported = loadApprovedOntologyInput(root, approvedRun, { vault })
      if (
        !same(imported.file_hashes, plan.approval_files) ||
        imported.article.event_id !== plan.event_id
      )
        throw Error("Imported native approval differs from its source")
      await assertProcessedFactReview(
        root,
        approvedRun,
        readJSON(root, `runs/${approvedRun}/reviewed-claims.json`),
      )
      const receipt = {
        schema: "research-native-approval-import/v1",
        input_sha256: sha256(JSON.stringify(plan)),
        approved_run: approvedRun,
        event_id: plan.event_id,
        approval_files: plan.approval_files,
        bound_runs: plan.bound_runs,
        files: plan.files,
        status: "imported",
        new_approval: false,
        candidate_published: false,
      }
      const prior = readJSON(root, base + "receipt.json")
      if (prior && !same(prior, receipt)) throw Error("Native import receipt changed")
      if (!prior) atomicCreate(root, base + "receipt.json", receipt)
      return { ...receipt, copied_files: copied, reused_files: reused, reused: Boolean(prior) }
    }),
  )
}
