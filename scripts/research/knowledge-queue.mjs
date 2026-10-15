import fs from "node:fs"
import path from "node:path"
import { noteText } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertConceptConflicts } from "./knowledge-links.mjs"
import {
  loadKnowledgeDraftInput,
  loadCompletedKnowledgeDraft,
  writeKnowledgeDraft,
} from "./knowledge-editor.mjs"
import { Ollama, localOllamaURL } from "./ollama.mjs"
import { prepareRoleProvider, resolveRolePolicy } from "./model-policy.mjs"
import { createModelProvider } from "./model-provider.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

// Explicit specialist selections only. Nothing here selects terms, approves
// prose, changes Knowledge authority, assigns articles or publishes content.
export function prepareKnowledgeJobs(root, inputFiles, { vault = "vault" } = {}) {
  if (
    !inputFiles ||
    typeof inputFiles !== "object" ||
    Array.isArray(inputFiles) ||
    Object.keys(inputFiles).length > 40
  )
    throw Error("Up to forty explicit knowledge inputs required")
  const ids = new Set(),
    notes = []
  const jobs = Object.entries(inputFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([run, file]) => {
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(run) || typeof file !== "string" || !file.trim())
        throw Error("Safe knowledge run and input file required")
      const bytes = fs.readFileSync(file),
        input = JSON.parse(bytes)
      const context = loadKnowledgeDraftInput(root, input, { vault })
      if (ids.has(context.note.meta.concept_id))
        throw Error("One knowledge selection per specialist ID required")
      ids.add(context.note.meta.concept_id)
      notes.push({
        path: input.path,
        operation: input.operation || "replace",
        content: noteText(context.note.meta, context.note.body),
      })
      // Reject a changed completed input before another job starts inference.
      loadCompletedKnowledgeDraft(root, run, input, { vault })
      return {
        run,
        input_file: path.resolve(file),
        input_sha256: sha256(bytes),
        source_files: context.sourceFiles,
        concept_id: context.note.meta.concept_id,
        path: input.path,
        previous_sha256: context.original_sha256,
      }
    })
  assertConceptConflicts(vault, notes)
  return jobs
}

export async function processKnowledgeQueue({
  root,
  runId,
  inputFiles,
  vault = "vault",
  policyFile = "data/research-model-policy.json",
  execute = false,
  maxItems = 4,
  timeBudgetMs = 1_800_000,
  clock = Date.now,
  providerFactory = prepareLocalProvider,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(runId || "") ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 0 ||
    maxItems > 40 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 3_600_000
  )
    throw Error("Safe bounded knowledge queue required")
  root = path.resolve(root)
  vault = path.resolve(vault)
  const jobs = prepareKnowledgeJobs(root, inputFiles, { vault }),
    policyBytes = fs.readFileSync(policyFile)
  const policy = JSON.parse(policyBytes),
    settings = resolveRolePolicy(policy, "concept_write")
  const endpoint = new Ollama({
    url: process.env.TECH_KNOWLEDGE_OLLAMA_URL ?? policy.runtime?.ollama_url ?? localOllamaURL(),
  }).url
  const effectivePolicy = {
    ...policy,
    runtime: { ...(policy.runtime || {}), ollama_url: endpoint },
  }
  return withLock(root, "knowledge-queue-" + runId, async () => {
    const base = `runs/${runId}/knowledge-queue/`,
      input = {
        schema: "research-knowledge-queue-input/v1",
        run_id: runId,
        vault,
        jobs,
        policy_file: path.resolve(policyFile),
        policy_sha256: sha256(policyBytes),
        ollama_url: endpoint,
        writer_implementation_sha256: sha256(
          fs.readFileSync(new URL("./knowledge-editor.mjs", import.meta.url)),
        ),
        implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      }
    const previous = readJSON(root, base + "input.json")
    if (previous && JSON.stringify(previous) !== JSON.stringify(input))
      throw Error("Knowledge queue input changed; preserve it and use a new run")
    if (!previous) atomicCreate(root, base + "input.json", input)
    const inputHash = sha256(JSON.stringify(input)),
      old = readJSON(root, base + "latest.json")
    if (
      old &&
      (old.input_sha256 !== inputHash ||
        !Array.isArray(old.results) ||
        JSON.stringify(old.results.map((r) => r.run)) !== JSON.stringify(jobs.map((j) => j.run)) ||
        old.results.some(
          (r) =>
            !["pending", "running", "draft_ready", "failed", "waiting_for_reasoning"].includes(
              r.status,
            ),
        ))
    )
      throw Error("Knowledge queue checkpoint changed")
    const rows = new Map((old?.results || []).map((r) => [r.run, r])),
      started = clock()
    let generated = 0
    const persist = () => {
      const results = jobs.map(
        (j) =>
          rows.get(j.run) || {
            run: j.run,
            concept_id: j.concept_id,
            path: j.path,
            status: "pending",
          },
      )
      const counts = Object.fromEntries(
        ["pending", "running", "draft_ready", "failed"].map((s) => [
          s,
          results.filter((r) => r.status === s).length,
        ]),
      )
      const waiting = results.filter((r) => r.status === "waiting_for_reasoning").length
      if (waiting) counts.waiting_for_reasoning = waiting
      const record = {
        schema: "research-knowledge-queue/v1",
        run_id: runId,
        input_sha256: inputHash,
        status: counts.running
          ? "running"
          : counts.pending
            ? "yielded"
            : counts.failed
              ? "partial"
              : counts.waiting_for_reasoning
                ? "waiting_for_reasoning"
                : "review_pending",
        counts,
        results,
        next_run: results.find((r) => r.status === "pending")?.run || null,
        candidate_published: false,
        approvals_created: false,
        drive_verified: false,
      }
      atomicWrite(root, base + "latest.json", record)
      return { ...record, receipt: base + "latest.json" }
    }
    // All completed drafts are read before the generation budget is applied.
    for (const job of jobs) {
      const selectionBytes = fs.readFileSync(job.input_file),
        selection = JSON.parse(selectionBytes)
      if (sha256(selectionBytes) !== job.input_sha256)
        throw Error("Knowledge selection changed during queue execution")
      const completed = loadCompletedKnowledgeDraft(root, job.run, selection, { vault })
      const previousRow = rows.get(job.run)
      if (
        previousRow?.status === "draft_ready" &&
        (!completed || previousRow.draft.sha256 !== completed.record_sha256)
      )
        throw Error("Completed knowledge queue output changed")
      if (previousRow?.status === "draft_ready") continue
      if (completed)
        rows.set(job.run, {
          run: job.run,
          concept_id: job.concept_id,
          path: job.path,
          status: "draft_ready",
          draft: { path: completed.record_path, sha256: completed.record_sha256 },
          problems: completed.record.problems,
          generation_reused: true,
          candidate_published: false,
        })
    }
    if (!execute) return persist()
    for (const job of jobs) {
      if (["draft_ready", "failed"].includes(rows.get(job.run)?.status)) continue
      if (generated >= maxItems || clock() - started >= timeBudgetMs) break
      await withLock(root, "run-" + job.run, async () => {
        if (
          sha256(fs.readFileSync(job.input_file)) !== job.input_sha256 ||
          sha256(fs.readFileSync(policyFile)) !== input.policy_sha256
        )
          throw Error("Knowledge input or policy changed during queue execution")
        const selection = JSON.parse(fs.readFileSync(job.input_file))
        const context = loadKnowledgeDraftInput(root, selection, { vault })
        if (JSON.stringify(context.sourceFiles) !== JSON.stringify(job.source_files))
          throw Error("Knowledge evidence changed during queue execution")
        // A recovered interrupted job may already have an exact completed draft.
        const completed = loadCompletedKnowledgeDraft(root, job.run, selection, { vault })
        if (completed) {
          rows.set(job.run, {
            run: job.run,
            concept_id: job.concept_id,
            path: job.path,
            status: "draft_ready",
            draft: { path: completed.record_path, sha256: completed.record_sha256 },
            problems: completed.record.problems,
            generation_reused: true,
            candidate_published: false,
          })
          return
        }
        const draftStage = readJSON(root, `runs/${job.run}/knowledge-draft/state.json`)?.stages
          ?.draft
        if (draftStage && draftStage.status !== "waiting_for_reasoning") {
          rows.set(job.run, {
            run: job.run,
            concept_id: job.concept_id,
            path: job.path,
            status: "failed",
            error: "Incomplete native knowledge checkpoint requires explicit review",
            automatic_retry: false,
            candidate_published: false,
          })
          return
        }
        if (clock() - started >= timeBudgetMs) return
        rows.set(job.run, {
          run: job.run,
          concept_id: job.concept_id,
          path: job.path,
          status: "running",
        })
        persist()
        generated++
        try {
          const remaining = Math.max(1, timeBudgetMs - (clock() - started))
          const provider = await providerFactory({
            root,
            run: job.run,
            policy: effectivePolicy,
            remainingMs: remaining,
          })
          await writeKnowledgeDraft(root, job.run, selection, {
            vault,
            ollama: provider,
            model: settings.model,
          })
          const saved = loadCompletedKnowledgeDraft(root, job.run, selection, { vault })
          if (!saved) throw Error("Knowledge writer did not create a completed native draft")
          rows.set(job.run, {
            run: job.run,
            concept_id: job.concept_id,
            path: job.path,
            status: "draft_ready",
            draft: { path: saved.record_path, sha256: saved.record_sha256 },
            problems: saved.record.problems,
            generation_reused: false,
            candidate_published: false,
          })
        } catch (error) {
          rows.set(job.run, {
            run: job.run,
            concept_id: job.concept_id,
            path: job.path,
            status: error.code === "REASONING_PENDING" ? "waiting_for_reasoning" : "failed",
            ...(error.reasoning_task ? { reasoning_task: error.reasoning_task } : {}),
            error: error instanceof Error ? error.message : String(error),
            automatic_retry: false,
            candidate_published: false,
          })
        }
      })
      persist()
    }
    return persist()
  })
}

async function prepareLocalProvider({ root, run, policy, remainingMs }) {
  const settings = resolveRolePolicy(policy, "concept_write")
  const base = createModelProvider(policy, "concept_write", { root, run })
  return prepareRoleProvider(base, policy, "concept_write", {
    root,
    run,
    overrides:
      settings.provider === "codex"
        ? {}
        : {
            call_timeout_ms: Math.min(settings.call_timeout_ms, remainingMs),
            total_timeout_ms: Math.min(settings.total_timeout_ms, remainingMs),
          },
  })
}
