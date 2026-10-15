import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { safePath } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import {
  GPT_DEVELOPMENT_CHECKS,
  inspectDevelopmentCompletion,
  finalizeDevelopmentRelease,
} from "./development-release.mjs"

export const OPERATION_POLICY = "data/research-operation-policy.json"
export const DEVELOPMENT_CHECKS = GPT_DEVELOPMENT_CHECKS

// This check never starts a module, calls a model, writes a checkpoint or
// accesses Drive. A scheduled development hold is an expected outcome.
export function readOperationGate(repo, { executor = "codex" } = {}) {
  if (!["codex", "ollama"].includes(executor)) throw Error("Unknown operation executor")
  const result = {
    schema: "research-operation-gate/v1",
    status: "development_pending",
    regular_execution_allowed: false,
    expected_hold: true,
    source_requests: 0,
    model_calls: 0,
    remote_writes: 0,
    policy_path: OPERATION_POLICY,
    requested_executor: executor,
  }
  const file = safePath(repo, OPERATION_POLICY)
  if (!fs.existsSync(file)) return { ...result, reason: "operation_policy_missing" }
  const policy = JSON.parse(fs.readFileSync(file, "utf8"))
  if (
    policy.schema !== "research-operation-policy/v1" ||
    !["development", "ready"].includes(policy.phase) ||
    policy.default_executor !== "codex" ||
    policy.model_policies?.codex !== "data/research-model-policy-codex.json" ||
    policy.model_policies?.ollama !== "data/research-model-policy.json" ||
    policy.recovery?.automatic_retry !== false ||
    policy.recovery?.reuse_completed !== true ||
    policy.recovery?.same_input_required !== true ||
    policy.recovery?.uncertain_write !== "readback_before_resume"
  )
    throw Error("Invalid research operation policy")
  Object.assign(result, {
    phase: policy.phase,
    default_executor: policy.default_executor,
    model_policies: policy.model_policies,
    recovery: policy.recovery,
    storage_backend: policy.storage_backend || "connected_drive",
    local_execution_enabled: policy.optional_execution?.ollama?.enabled === true,
    required_checks: DEVELOPMENT_CHECKS,
  })
  if (policy.phase === "development") return { ...result, reason: "development_not_complete" }
  if (executor === "ollama" && policy.optional_execution?.ollama?.enabled !== true)
    return { ...result, status: "executor_not_ready", reason: "local_executor_not_enabled" }
  const ref = policy.development_completion
  if (
    typeof ref?.path !== "string" ||
    !ref.path.startsWith(".local/research/") ||
    !/^[a-f0-9]{64}$/.test(ref.sha256 || "")
  )
    return { ...result, reason: "development_evidence_required" }
  try {
    const evidenceFile = safePath(repo, ref.path)
    if (!fs.existsSync(evidenceFile)) return { ...result, reason: "development_evidence_missing" }
    if (fs.statSync(evidenceFile).size > 1024 * 1024)
      throw Error("Development evidence exceeds the metadata budget")
    const bytes = fs.readFileSync(evidenceFile)
    if (sha256(bytes) !== ref.sha256) return { ...result, reason: "development_evidence_changed" }
    const inspected = inspectDevelopmentCompletion(repo, ref, policy)
    if (!inspected.valid)
      return {
        ...result,
        reason: inspected.reason,
        ...(inspected.changed_path ? { changed_path: inspected.changed_path } : {}),
      }
    const evidence = inspected.record
    if (executor === "ollama") {
      const localRef = policy.optional_execution.ollama.development_completion
      if (!localRef)
        return { ...result, status: "executor_not_ready", reason: "local_completion_required" }
      const local = inspectDevelopmentCompletion(repo, localRef, policy, { executor: "ollama" })
      if (!local.valid)
        return { ...result, status: "executor_not_ready", reason: "local_" + local.reason }
    }
    return {
      ...result,
      status: "ready",
      expected_hold: false,
      regular_execution_allowed: true,
      development_completion: ref,
      release_id: evidence.release_id,
    }
  } catch (error) {
    if (error.code === "STORAGE_PENDING")
      return {
        ...result,
        reason: "development_evidence_requires_storage",
        storage_request: error.storage_request,
      }
    return { ...result, reason: "development_evidence_invalid" }
  }
}

export function moduleRecoveryPlan(job) {
  const common = {
    automatic_retry: false,
    preserve_completed: true,
    same_input_required: true,
    job_id: job.job_id,
  }
  if (job.worker_alive === null || job.state === "worker_status_unknown")
    return { ...common, action: "restore_process_visibility", resume_after_resolution: false }
  if (job.worker_alive)
    return { ...common, action: "wait_for_current_worker", resume_after_resolution: false }
  if (job.state === "completed")
    return { ...common, action: "reuse_verified_result", resume_after_resolution: false }
  if (job.state === "waiting_for_reasoning")
    return {
      ...common,
      action: "resolve_exact_reasoning_task_then_resume",
      resume_after_resolution: true,
    }
  if (job.state === "waiting_for_storage")
    return { ...common, action: "hydrate_exact_payload_then_resume", resume_after_resolution: true }
  return {
    ...common,
    action: "diagnose_saved_failure_then_resume",
    resume_after_resolution: true,
    uncertain_write: "readback_before_resume",
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({
      options: {
        repo: { type: "string" },
        executor: { type: "string" },
        review: { type: "string" },
        "review-sha256": { type: "string" },
      },
      allowPositionals: true,
    })
    if (positionals.length !== 1 || !["status", "finalize"].includes(positionals[0]))
      throw Error(
        "Use operation-policy.mjs status [--executor codex|ollama] or finalize --review PATH --review-sha256 SHA [--repo PROJECT_ROOT]",
      )
    const repo = fs.realpathSync(values.repo || fileURLToPath(new URL("../../", import.meta.url)))
    const result =
      positionals[0] === "status"
        ? readOperationGate(repo, { executor: values.executor })
        : await finalizeDevelopmentRelease(repo, {
            path: values.review,
            sha256: values["review-sha256"],
          })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
