import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  readJSON,
  safePath,
  withGardenOperationLock,
  withLock,
} from "./run-state.mjs"
import { archiveManifest, packageResearchArchive } from "./archive.mjs"
import { loadShadowHandoffBasis } from "./shadow-collection-basis.mjs"
import { publicationOperationStatus } from "./publication-operation.mjs"
import { readDailyReceipts, verifyDailyReceipts } from "./daily-scan.mjs"
import { readBacklog } from "../research-window.mjs"
import { loadSameEventSourceAliases } from "./candidate-source-alternative.mjs"
import { buildArchiveClosure } from "./archive-closure.mjs"

const id = (value) => {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value || "")) throw Error("Exact workflow ID required")
  return value
}
const stem = (run) => `runs/${id(run)}/workflow-checkpoint`
function packaged(root, run) {
  const receipt = packageResearchArchive(root, run),
    file = `archive-staging/${run}/package-receipt.json`
  const old = readJSON(root, file)
  if (old && JSON.stringify(old) !== JSON.stringify(receipt))
    throw Error("Workflow package receipt changed")
  if (!old) atomicCreate(root, file, receipt)
  return receipt
}
const allowed = (file) =>
  /^(daily\/|evaluation\/shadow-(inputs|bases)\/|runs\/|documents\/|parses\/|publication\/|authoring-write-intents\/)/.test(
    file,
  ) &&
  !file
    .split("/")
    .some((p) => ["runtime", "locks", "preview-workspace", "node_modules"].includes(p)) &&
  !/^runs\/[^/]+\/preview\//.test(file)

function tree(root, relative, add, filter = allowed) {
  const directory = safePath(root, relative)
  if (!fs.existsSync(directory)) return
  for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = relative + "/" + e.name
    if (e.isSymbolicLink()) throw Error("Symlink in workflow checkpoint")
    if (e.isDirectory()) {
      if (filter(file + "/")) tree(root, file, add, filter)
    } else if (e.isFile()) add(file)
  }
}

// Freeze coordinator state and its selected acquisition/publication evidence.
// This is deliberately separate from credentials, runtime installation and
// the historical source corpus; it never creates approvals or publishes.
export function workflowCheckpointPlan({
  root,
  dailyRun,
  publicationRun,
  backlogFile,
  vault,
  repository = process.cwd(),
}) {
  id(dailyRun)
  id(publicationRun)
  const pointer = readJSON(root, `daily/runs/${dailyRun}/shadow-basis.json`)
  if (pointer?.daily_run !== dailyRun) throw Error("Frozen daily handoff required")
  const basis = loadShadowHandoffBasis(root, pointer.basis)
  const publication = publicationOperationStatus({ root, run: publicationRun, repository })
  if (publication.observation_basis !== "archived_observation")
    throw Error("Archive the original publication readback before checkpointing")
  const backlog = readBacklog(backlogFile)
  if (!backlog) throw Error("Exact candidate backlog required")
  const files = new Map()
  const add = (relative, origin = root, destination = "root/" + relative, prepared = null) => {
    if (origin === root && !allowed(relative))
      throw Error("Unsupported workflow input: " + relative)
    const file = safePath(origin, relative),
      bytes = prepared === null ? fs.readFileSync(file) : Buffer.from(prepared)
    const row = {
      destination,
      bytes: bytes.length,
      sha256: sha256(bytes),
      origin,
      relative,
      ...(prepared === null ? {} : { content: bytes.toString("base64") }),
    }
    const old = files.get(destination)
    if (old && old.sha256 !== row.sha256) throw Error("Conflicting workflow bytes")
    files.set(destination, row)
  }
  tree(root, `daily/runs/${dailyRun}`, add)
  tree(root, `evaluation/shadow-inputs/${dailyRun}`, add)
  tree(root, `evaluation/shadow-bases/${dailyRun}`, add)
  if (fs.existsSync(safePath(root, "daily/route-coverage.json"))) add("daily/route-coverage.json")
  for (const receipt of readDailyReceipts(root, dailyRun)) {
    const run = receipt.scan_evidence?.list_scan_run
    if (!run) continue
    id(run)
    for (const file of archiveManifest(root, run).files) add(file.path)
    for (const parse of readJSON(root, `runs/${run}/parses.json`) || [])
      add(`parses/${parse.parse_id}/parse.json`)
  }
  // URL aliases are reviewed decisions, not title similarity. Their source,
  // review and original-event approval must travel together or restored scans
  // would lose the suppression proof and introduce duplicate candidates.
  const aliases = loadSameEventSourceAliases(root, backlogFile)
  for (const alias of new Map([...aliases.values()].map((a) => [a.resolution_run, a])).values()) {
    const candidate = backlog.candidates.find((c) => c.key === alias.candidate_key)
    const approvalRun = candidate?.approval?.approved_run
    // The original approval and alternative evidence can select different
    // articles; retain their separate closures rather than mislabelling one as
    // an editorial approval of the other's selected source.
    const approval = approvalRun
      ? readJSON(root, `runs/${approvalRun}/candidate-approval.json`)
      : null
    // A legacy publication binds its own historical Drive article/readback,
    // not the current approved-article.json of a later editorial revision.
    // The alias loader above revalidates that exact legacy receipt; retain it
    // without reinterpreting it as a new approval of today's article bytes.
    if (approvalRun) for (const file of archiveManifest(root, approvalRun).files) add(file.path)
    for (const dependency of new Set([
      alias.resolution_run,
      ...(approval?.legacy_publication?.source_run_id
        ? [approval.legacy_publication.source_run_id]
        : []),
    ])) {
      const authorityWrites = []
      const closure = buildArchiveClosure(root, "workflow-dependency-validation", dependency, [], {
        vault,
        authorityWrites,
      })
      const prepared = new Map(authorityWrites.map((w) => [w.path, w.content]))
      for (const file of closure.files)
        add(file.path, root, "root/" + file.path, prepared.get(file.path) ?? null)
    }
  }
  verifyDailyReceipts(
    root,
    readJSON(root, `daily/runs/${dailyRun}/plan.json`),
    readDailyReceipts(root, dailyRun),
    { backlogFile },
  )
  tree(root, `runs/${publicationRun}/publication-operation`, add)
  const input = readJSON(root, `runs/${publicationRun}/publication-operation/input.json`)
  tree(root, `runs/${input.preview_run}/drive-authoring`, add)
  add(`runs/${input.preview_run}/preview-manifest.json`)
  const push = readJSON(root, `runs/${publicationRun}/publication-operation/push.json`)
  if (push) add(push.push.path)
  const publicProof = readJSON(root, `runs/${publicationRun}/publication-operation/public.json`)
  if (publicProof) tree(root, `runs/${id(publicProof.readback_run)}/public-readback`, add)
  tree(root, "authoring-write-intents", (file) => {
    const intentPath = path.posix.dirname(file) + "/intent.json"
    const intent = readJSON(root, intentPath)
    if (intent?.release_path?.startsWith(`runs/${input.preview_run}/drive-authoring/`)) add(file)
  })
  add(path.basename(backlogFile), path.dirname(path.resolve(backlogFile)), "backlog.json")
  for (const folder of ["Editions", "Knowledge", "Signals", "TrendTopics"])
    tree(
      vault,
      folder,
      (file) => {
        if (!file.endsWith(".md"))
          throw Error("Only authoring Markdown belongs in the workflow checkpoint")
        add(file, vault, "vault/" + file)
      },
      () => true,
    )
  const rows = [...files.values()].sort((a, b) => a.destination.localeCompare(b.destination))
  if (
    rows.length > 20000 ||
    rows.reduce((n, r) => n + r.bytes, 0) > 2 * 1024 ** 3 ||
    rows.some((r) => r.bytes > 120 * 1024 ** 2)
  )
    throw Error("Workflow checkpoint exceeds bounded multipart recovery budget")
  return {
    schema: "research-workflow-checkpoint-plan/v1",
    daily_run: dailyRun,
    publication_run: publicationRun,
    basis: pointer.basis,
    publication,
    candidates: backlog.candidates.length,
    files: rows,
    network_used: false,
    candidate_published: false,
    full_runtime_recovered: false,
  }
}

export async function createWorkflowCheckpoint(options) {
  const { root, run } = options
  return withGardenOperationLock(root, () =>
    withLock(root, "workflow-checkpoint", () => {
      const plan = workflowCheckpointPlan(options),
        base = stem(run)
      const parts = []
      let part,
        bytes = 0,
        count = 0
      const pinned = {
        ...plan,
        files: plan.files.map(({ origin, relative, content, ...row }, i) => {
          if (!part || count >= 1000 || bytes + row.bytes > 120 * 1024 ** 2) {
            part = id(run + "-part-" + String(parts.length + 1).padStart(3, "0"))
            parts.push(part)
            bytes = 0
            count = 0
          }
          bytes += row.bytes
          count++
          return { ...row, stored_path: `runs/${part}/workflow-files/${i}.bin` }
        }),
        parts,
      }
      const old = readJSON(root, base + "/manifest.json")
      if (old && JSON.stringify(old) !== JSON.stringify(pinned))
        throw Error("Workflow checkpoint inputs changed; use a new ID")
      for (const [i, row] of plan.files.entries()) {
        const data =
          row.content === undefined
            ? fs.readFileSync(safePath(row.origin, row.relative))
            : Buffer.from(row.content, "base64")
        if (sha256(data) !== row.sha256) throw Error("Workflow input changed during capture")
        const target = pinned.files[i].stored_path
        if (fs.existsSync(safePath(root, target))) {
          if (!fs.readFileSync(safePath(root, target)).equals(data))
            throw Error("Workflow checkpoint bytes changed")
        } else atomicCreate(root, target, data)
      }
      // Recheck the complete input set once, before exposing the committed manifest.
      for (const row of plan.files)
        if (
          sha256(
            row.content === undefined
              ? fs.readFileSync(safePath(row.origin, row.relative))
              : Buffer.from(row.content, "base64"),
          ) !== row.sha256
        )
          throw Error("Workflow inputs changed during capture")
      if (!old) atomicCreate(root, base + "/manifest.json", pinned)
      const packages = parts.map((partRun) => {
        const manifestPath = `runs/${partRun}/archive-manifest.json`
        if (!readJSON(root, manifestPath))
          atomicCreate(root, manifestPath, archiveManifest(root, partRun))
        return { run_id: partRun, ...packaged(root, partRun) }
      })
      const archive = archiveManifest(root, run),
        manifestPath = `runs/${run}/archive-manifest.json`
      if (!readJSON(root, manifestPath)) atomicCreate(root, manifestPath, archive)
      return {
        run_id: run,
        files: plan.files.length,
        candidates: plan.candidates,
        package: packaged(root, run),
        parts: packages,
        reused: Boolean(old),
        candidate_published: false,
      }
    }),
  )
}

export async function restoreWorkflowCheckpoint({ root, checkpointRoot = root, run, destination }) {
  const base = stem(run),
    manifestBytes = fs.readFileSync(safePath(checkpointRoot, base + "/manifest.json"))
  const manifest = JSON.parse(manifestBytes)
  if (
    manifest.schema !== "research-workflow-checkpoint-plan/v1" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > 20000 ||
    manifest.candidate_published !== false ||
    manifest.full_runtime_recovered !== false ||
    !manifest.basis ||
    !Array.isArray(manifest.parts) ||
    !manifest.parts.length
  )
    throw Error("Exact workflow checkpoint required")
  id(manifest.daily_run)
  id(manifest.publication_run)
  if (
    manifest.parts.some((part, i) => part !== run + "-part-" + String(i + 1).padStart(3, "0")) ||
    manifest.files.reduce((n, row) => n + row.bytes, 0) > 2 * 1024 ** 3
  )
    throw Error("Invalid workflow multipart inventory")
  // Restore only into a named private view; never overlay canonical active state.
  if (!/^workflow-restores\/[A-Za-z0-9_-]+$/.test(destination || ""))
    throw Error("Named private workflow restore destination required")
  return withLock(root, "workflow-checkpoint", () => {
    const seen = new Set(),
      rows = manifest.files.map((row, i) => {
        if (
          typeof row.destination !== "string" ||
          row.destination.includes("\\") ||
          row.destination.split("/").some((s) => !s || s === "." || s === "..") ||
          seen.has(row.destination) ||
          !(
            row.destination === "backlog.json" ||
            /^vault\/(Editions|Knowledge|Signals|TrendTopics)\/.+\.md$/.test(row.destination) ||
            (row.destination.startsWith("root/") && allowed(row.destination.slice(5)))
          ) ||
          !Number.isSafeInteger(row.bytes) ||
          row.bytes < 0 ||
          !/^[a-f0-9]{64}$/.test(row.sha256 || "")
        )
          throw Error("Invalid or escaping workflow checkpoint destination")
        seen.add(row.destination)
        const part = manifest.parts.find(
          (partRun) => row.stored_path === `runs/${partRun}/workflow-files/${i}.bin`,
        )
        if (!part || !part.startsWith(run + "-part-"))
          throw Error("Workflow multipart binding changed")
        id(part)
        const data = fs.readFileSync(safePath(checkpointRoot, row.stored_path))
        if (data.length !== row.bytes || sha256(data) !== row.sha256)
          throw Error("Workflow checkpoint hash mismatch")
        const target = `${destination}/${row.destination}`,
          file = safePath(root, target)
        if (fs.existsSync(file) && !fs.readFileSync(file).equals(data))
          throw Error("Workflow restore conflict; preserving destination")
        return { data, target }
      })
    // Preflight every file before creating anything; interrupted copies resume
    // only with identical bytes and cannot replace an existing changed ledger.
    for (const { data, target } of rows)
      if (!fs.existsSync(safePath(root, target))) atomicCreate(root, target, data)
    const view = safePath(root, destination + "/root"),
      vault = safePath(root, destination + "/vault"),
      backlogFile = safePath(root, destination + "/backlog.json")
    const basis = loadShadowHandoffBasis(view, manifest.basis)
    const backlog = readBacklog(backlogFile)
    const publication = publicationOperationStatus({ root: view, run: manifest.publication_run })
    const receipts = readDailyReceipts(view, manifest.daily_run)
    verifyDailyReceipts(
      view,
      readJSON(view, `daily/runs/${manifest.daily_run}/plan.json`),
      receipts,
      { backlogFile },
    )
    if (
      !backlog ||
      backlog.candidates.length !== manifest.candidates ||
      JSON.stringify(publication) !== JSON.stringify(manifest.publication)
    )
      throw Error("Recovered workflow differs from pinned coordinator state")
    const result = {
      schema: "research-workflow-restore/v1",
      checkpoint_sha256: sha256(manifestBytes),
      daily_run: basis.daily_run,
      root: view,
      vault,
      backlog_file: backlogFile,
      files: rows.length,
      candidates: backlog.candidates.length,
      acquisition_receipts: receipts.length,
      publication,
      network_used: false,
      candidate_published: false,
      new_regular_operation_counted: false,
      full_runtime_recovered: false,
    }
    const receiptPath = destination + "/restore.json",
      old = readJSON(root, receiptPath)
    if (old && JSON.stringify(old) !== JSON.stringify(result))
      throw Error("Workflow restore receipt changed")
    if (!old) atomicCreate(root, receiptPath, result)
    return result
  })
}
