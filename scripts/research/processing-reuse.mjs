import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { loadCompletedExtraction } from "./extraction-checkpoint.mjs"
import { loadRoleBudget } from "./model-policy.mjs"
import { assessWindowEvidenceCheckpoint } from "./window-evidence-assessment.mjs"
import { loadProcessedSourceResult } from "./processed-source-result.mjs"
import { readJSON, safePath, withLock } from "./run-state.mjs"

const completed = new Set([
  "fact_review",
  "writer_required",
  "editorial_review",
  "approved",
  "approval_ready",
  "reviewed_without_publishable_facts",
  "empty_extraction_review",
  "empty_extraction_source_deferred",
  "empty_extraction_no_event",
])
const identity = (entry) =>
  JSON.stringify([entry.source_version_id, entry.parse_id, entry.content_sha256])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function processingSourceLockName(row, policyHash) {
  return (
    "processing-source-" +
    sha256(
      JSON.stringify([
        JSON.stringify([
          row.article_source_version_id,
          row.article_parse_id,
          row.article_content_sha256,
        ]),
        policyHash,
      ]),
    ).slice(0, 24)
  )
}

// Ephemeral lookup over native receipts. It never owns source facts or approvals.
export function buildDailyProcessingReuseIndex(root) {
  const directory = safePath(root, "runs"),
    records = [],
    diagnostics = []
  if (!fs.existsSync(directory)) return { records, diagnostics }
  for (const folder of fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((f) => f.isDirectory() && /^[A-Za-z0-9_-]+$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const base = `runs/${folder.name}/`
    if (!fs.existsSync(safePath(root, base + "daily-processing.json"))) continue
    let input, receipt
    try {
      input = readJSON(root, base + "daily-processing-input.json")
      receipt = readJSON(root, base + "daily-processing.json")
    } catch (error) {
      diagnostics.push({ run: folder.name, status: "unreadable", reason: error.message })
      continue
    }
    if (
      receipt?.schema !== "research-daily-processing/v1" ||
      input?.schema !== "research-daily-processing-input/v1" ||
      !Array.isArray(input.entries) ||
      !Array.isArray(receipt.results)
    ) {
      diagnostics.push({ run: folder.name, status: "unsupported" })
      continue
    }
    if (receipt.status === "running") continue
    const valid =
      receipt.run_id === folder.name &&
      receipt.input_sha256 === sha256(JSON.stringify(input)) &&
      same(
        input.candidate_keys,
        receipt.results.map((row) => row.candidate_key),
      ) &&
      receipt.total === input.candidate_keys.length &&
      receipt.candidate_published === false &&
      receipt.public_approved === false &&
      same(
        receipt.counts,
        Object.fromEntries(
          [...new Set(receipt.results.map((row) => row.status))].map((status) => [
            status,
            receipt.results.filter((row) => row.status === status).length,
          ]),
        ),
      )
    for (const row of receipt.results) {
      if (!completed.has(row.status) || !row.processing_run) continue
      const entries = input.entries.filter((entry) => entry?.candidate_key === row.candidate_key)
      for (const entry of entries)
        records.push({
          entry,
          processing_run: row.processing_run,
          parent_run: folder.name,
          policy_sha256: input.policy_sha256,
          valid: valid && entries.length === 1,
          input_reference: {
            path: base + "daily-processing-input.json",
            sha256: sha256(fs.readFileSync(safePath(root, base + "daily-processing-input.json"))),
          },
        })
    }
  }
  return { records, diagnostics }
}

// Capture source semantics, including every supporting document and exact parse.
// Retrieval timestamps may differ without changing an identical source version.
export function processingSourceFingerprint(selected) {
  return sha256(
    JSON.stringify({
      primary: selected.documents[0]?.source_version_id,
      documents: selected.documents
        .map((doc) => [
          canonicalURL(doc.original_url),
          doc.source_id,
          doc.source_version_id,
          doc.body_sha256,
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      parses: selected.parses
        .map((parse) => [parse.parse_id, parse.source_version_id, sha256(JSON.stringify(parse))])
        .sort((a, b) => a[0].localeCompare(b[0])),
    }),
  )
}

export async function findReusableDailyProcessing(
  root,
  entry,
  selected,
  {
    index = buildDailyProcessingReuseIndex(root),
    policyBytes,
    evidenceThink = false,
    vault = "vault",
  } = {},
) {
  if (!policyBytes) throw Error("Exact processing policy bytes required")
  const policyHash = sha256(policyBytes),
    normalizedPolicyHash = sha256(JSON.stringify(JSON.parse(policyBytes)))
  const sourceFingerprint = processingSourceFingerprint(selected),
    seen = new Set()
  const observation = {
    index_records: index.records.length,
    unreadable_receipts: index.diagnostics.filter((item) => item.status === "unreadable").length,
    unsupported_receipts: index.diagnostics.filter((item) => item.status === "unsupported").length,
    source_context_changed: 0,
    policy_changed: 0,
  }
  for (const record of index.records) {
    if (
      identity(record.entry) !== identity(entry) ||
      record.policy_sha256 !== policyHash ||
      seen.has(record.processing_run)
    )
      continue
    seen.add(record.processing_run)
    if (!record.valid)
      throw Error("Matched processing receipt differs from its frozen input: " + record.parent_run)
    if (
      sha256(fs.readFileSync(safePath(root, record.input_reference.path))) !==
      record.input_reference.sha256
    )
      throw Error("Matched processing input changed")
    const input = readJSON(root, `runs/${record.processing_run}/source-processing-input.json`)
    if (!input) throw Error("Matched completed processing lacks its source checkpoint")
    if (
      input.policy_sha256 !== normalizedPolicyHash ||
      !same(input.evidence_overrides, { think: evidenceThink })
    ) {
      observation.policy_changed++
      continue
    }
    const previous = loadStoredSourceRun(root, record.processing_run)
    if (processingSourceFingerprint(previous) !== sourceFingerprint) {
      observation.source_context_changed++
      continue
    }
    const result = await loadProcessedSourceResult(root, record.processing_run, entry, { vault })
    return {
      run: record.processing_run,
      input_sha256: result.processing_input_sha256,
      source_fingerprint: sourceFingerprint,
      parent: record.input_reference,
      model_calls: 0,
      result,
      observation,
    }
  }
  return { run: null, observation }
}

// Explicit recovery delegates to native readers. Completed work is reused;
// a failed attempt and its unreviewed claims remain immutable and private.
export function assertProcessingRecoveryRequest(recovery) {
  if (
    !recovery ||
    typeof recovery !== "object" ||
    Array.isArray(recovery) ||
    Object.keys(recovery).some((key) => !["run", "assessment"].includes(key)) ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(recovery.run || "") ||
    !["none", "partial"].includes(recovery.assessment ?? "none")
  )
    throw Error("Explicit processing recovery requires a run and assessment mode")
}

export async function loadProcessingRecovery(root, recovery, entry, selected) {
  assertProcessingRecoveryRequest(recovery)
  return withLock(root, "run-" + recovery.run, async () => {
    const base = `runs/${recovery.run}/`,
      input = readJSON(root, base + "source-processing-input.json"),
      state = readJSON(root, base + "processing/state.json")
    if (
      input?.schema !== "research-source-processing-input/v1" ||
      state?.input_hash !== sha256(JSON.stringify(input)) ||
      !Object.values(state.stages || {}).some((stage) => stage.status === "failed") ||
      Object.values(state.stages || {}).some((stage) => stage.status === "running") ||
      ["reviewed-claims.json", "draft.json", "approved-article.json"].some((file) =>
        fs.existsSync(safePath(root, base + file)),
      )
    )
      throw Error("Stopped failed processing without fact review or approval required")
    const previous = loadStoredSourceRun(root, recovery.run)
    if (processingSourceFingerprint(previous) !== processingSourceFingerprint(selected))
      throw Error("Processing recovery source context changed")
    const parse = previous.parses.find(
      (p) => p.parse_id === entry.parse_id && p.source_version_id === entry.source_version_id,
    )
    const document = previous.documents.find((d) => d.source_version_id === entry.source_version_id)
    if (
      !parse ||
      !document ||
      articleContentFingerprint(parse, previous.parses) !== entry.content_sha256 ||
      !entry.source_urls?.some((url) => canonicalURL(url) === canonicalURL(document.original_url))
    )
      throw Error("Processing recovery candidate source changed")
    const bytes = loadCompletedExtraction(root, recovery.run, selected.documents, selected.parses),
      extracted = JSON.parse(bytes)
    if (
      !extracted.claims?.length ||
      extracted.claims.some(
        (claim) =>
          claim.candidate_key !== input.candidate_key || claim.review?.status !== "unreviewed",
      )
    )
      throw Error("Processing recovery requires unreviewed extracted claims")
    const files = [
        base + "source-processing-input.json",
        base + "processing/state.json",
        base + "processing/extraction.json",
        base + "claims.json",
        base + "documents.json",
        base + "parses.json",
      ],
      recipe = { extraction_run: recovery.run }
    if (recovery.assessment === "partial") {
      const assessmentBase = `runs/${input.assessment_run}/evidence-assessment/`,
        assessmentInput = readJSON(root, assessmentBase + "input.json")
      if (assessmentInput?.schema !== "research-window-evidence-assessment-input/v1")
        throw Error("Partial recovery requires native window assessment")
      const ledger = loadRoleBudget(root, input.assessment_run, "evidence_compare")
      const result = await assessWindowEvidenceCheckpoint(
        root,
        input.assessment_run,
        { executionPolicy: ledger.binding },
        extracted.claims,
        selected.documents,
        selected.parses,
        {
          claimsPerBatch: assessmentInput.claims_per_batch,
          responseProtocol: assessmentInput.response_protocol || "verbatim-quote/v1",
          reuseRun: assessmentInput.reuse_run,
          readOnly: true,
          partial: true,
        },
      )
      if (!result.completed_windows.length)
        throw Error("Partial recovery has no completed evidence windows")
      recipe.assessment_reuse_run = input.assessment_run
      for (const row of result.completed_windows) {
        files.push(
          assessmentBase + `batch-${row.index + 1}.json`,
          assessmentBase + `batch-${row.index + 1}-checkpoint.json`,
        )
      }
    }
    if (recipe.assessment_reuse_run) {
      files.push(
        `runs/${input.assessment_run}/evidence-assessment/input.json`,
        `runs/${input.assessment_run}/model-policy/evidence_compare/budget.json`,
      )
    }
    return {
      ...recipe,
      source_fingerprint: processingSourceFingerprint(selected),
      references: files.map((file) => ({
        path: file,
        sha256: sha256(fs.readFileSync(safePath(root, file))),
      })),
    }
  })
}
