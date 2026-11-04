import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { submitModuleJob, moduleJobStatus } from "./module-runtime.mjs"
import { readyArticleItems, readReasoningTask } from "./reasoning-tasks.mjs"
import { implementationFiles } from "./development-release.mjs"

// A private native processing session uses the same curation jobs and validators
// as daily operation. The caller relays only the bound model requests returned
// here; continuation positions and successor ownership belong to the program.
export async function driveArticleProcessingSession(
  ctx,
  p,
  {
    submit = submitModuleJob,
    status = moduleJobStatus,
    readTask = readReasoningTask,
    result = (ctx, job) => {
      const bytes = fs.readFileSync(safePath(ctx.root, job.result.path))
      if (sha256(bytes) !== job.result.sha256) throw Error("Processing job result SHA changed")
      const envelope = JSON.parse(bytes)
      if (
        envelope.schema !== "research-module-result/v1" ||
        envelope.input_sha256 !== job.input_sha256
      )
        throw Error("Exact native processing envelope required")
      return envelope.data
    },
  } = {},
) {
  if (!/^[A-Za-z0-9_-]{1,70}$/.test(p.run_id || "") || p.review_mode !== "combined/v1")
    throw Error("Bound combined article processing session required")
  if (p.review_repair_mode !== undefined && p.review_repair_mode !== "components/v1")
    throw Error("Bound combined review repair mode required")
  const base = `processing-sessions/${p.run_id}/`
  const selectionBytes = fs.readFileSync(safePath(ctx.root, p.selection_path))
  if (sha256(selectionBytes) !== p.selection_sha256) throw Error("Processing session selection changed")
  const selection = JSON.parse(selectionBytes)
  const priorSession = readJSON(ctx.root, base + "input.json")
  const selectedCount = priorSession && priorSession.selected_count === undefined
    ? 32 : selection.selected?.length
  if (!Number.isSafeInteger(selectedCount) || selectedCount < 1 || selectedCount > 40)
    throw Error("One to 40 selected articles required")
  const input = {
    schema: "research-article-processing-session/v1",
    run_id: p.run_id,
    selection: { path: p.selection_path, sha256: p.selection_sha256 },
    review_mode: p.review_mode,
    ...(p.review_repair_mode ? { review_repair_mode: p.review_repair_mode } : {}),
    ...(!priorSession || priorSession.selected_count !== undefined ? { selected_count: selectedCount } : {}),
    model_policy_sha256: sha256(fs.readFileSync(ctx.policy)),
    implementation_sha256: sha256(
      JSON.stringify(
        implementationFiles(ctx.executionRepo || ctx.repo).map((file) => [
          file,
          sha256(fs.readFileSync(safePath(ctx.executionRepo || ctx.repo, file))),
        ]),
      ),
    ),
    max_parallel_models: 3,
    publication_permitted: false,
  }
  return withLock(ctx.root, "processing-session-" + p.run_id, async () => {
    const priorInput = readJSON(ctx.root, base + "input.json")
    if (priorInput && JSON.stringify(priorInput) !== JSON.stringify(input))
      throw Error("Frozen processing session changed")
    if (!priorInput) atomicCreate(ctx.root, base + "input.json", input)
    const previous = readJSON(ctx.root, base + "latest.json")
    const saved = {
      schema: "research-article-processing-session-status/v1",
      run_id: p.run_id,
      started_at: previous?.started_at || new Date().toISOString(),
      jobs: previous?.jobs || [],
      transitions: previous?.transitions || [],
      actual_model_duration_ms: null,
      article_timing: previous?.article_timing || {},
      request_timing: previous?.request_timing || {},
      pure_model_execution_ms: null,
      max_parallel_models: 3,
      production_writes: 0,
      candidate_published: false,
    }
    const save = (fields) => {
      const value = { ...saved, ...fields, observed_at: new Date().toISOString() }
      atomicWrite(ctx.root, base + "latest.json", value)
      return value
    }
    const last = saved.jobs.at(-1)
    if (last) {
      if (
        previous.status === "dispatching" &&
        !readJSON(ctx.root, `module-jobs/${last.job_id}/input.json`)
      ) {
        const launched = await submit(ctx, "curation", "advance", sessionParameters(input), {
          jobId: last.job_id,
          background: true,
        })
        return save({ status: "running", job_id: last.job_id, job: launched })
      }
      const job = status(ctx, last.job_id)
      if (job.worker_alive !== false)
        return save({ status: job.worker_alive ? "running" : "worker_status_unknown", job })
      if (job.state !== "completed")
        return save({ status: job.state, job, recovery: job.recovery || null })
      const native = result(ctx, job)
      if (!native) throw Error("Exact completed native processing result required")
      const observed = new Date().toISOString()
      for (const row of native.rows) {
        const key = row.candidate_id
        const before = saved.article_timing[key]
        saved.article_timing[key] = {
          ...before,
          writer_run: row.writer_run || row.approved_run,
          first_observed_at: before?.first_observed_at || observed,
          last_status: row.status,
          ...(["approved", "reused"].includes(row.status)
            ? { approved_observed_at: before?.approved_observed_at || observed }
            : {}),
        }
        if (row.reasoning_task) {
          const task = row.reasoning_task,
            id = task.task_id
          const old = saved.request_timing[id],
            created = readJSON(ctx.root, `reasoning-tasks/${id}/created.json`)
          saved.request_timing[id] = {
            ...old,
            task_id: id,
            request_sha256: task.request_sha256,
            candidate_ids: [...new Set([...(old?.candidate_ids || []), key])],
            created_at: created?.created_at || null,
            pure_model_execution_ms: null,
          }
        }
      }
      for (const timing of Object.values(saved.request_timing)) {
        if (!/^reasoning-[a-f0-9]{64}$/.test(timing.task_id || "") ||
            !/^[a-f0-9]{64}$/.test(timing.request_sha256 || ""))
          throw Error("Exact processing request timing required")
        const retired = readJSON(ctx.root, `reasoning-tasks/${timing.task_id}/retired.json`)
        if (retired) {
          if (timing.submitted_at || retired.task_id !== timing.task_id ||
              retired.request_sha256 !== timing.request_sha256 || !retired.reason ||
              !Number.isFinite(Date.parse(retired.retired_at || "")))
            throw Error("Retired processing request timing changed")
          timing.retired_at = retired.retired_at
          continue
        }
        // Historical timing is not an approval gate. Recheck completed results
        // once at final handoff instead of rereading every old task in each slice.
        if (timing.submitted_at && native.status !== "complete") continue
        const checked = readTask(ctx.root, timing)
        if (checked.status === "completed") {
          const response = readJSON(ctx.root, checked.result.path)
          timing.submitted_at = response.submitted_at
          timing.request_round_trip_ms = timing.created_at
            ? Date.parse(response.submitted_at) - Date.parse(timing.created_at)
            : null
        }
      }
      if (native.status === "complete") {
        if (
          native.rows.length !== (input.selected_count ?? 32) ||
          native.rows.some((r) => !["approved", "reused"].includes(r.status))
        )
          throw Error("All selected native approvals and handoff required")
        const completed_at = previous?.completed_at || new Date().toISOString()
        return save({
          status: "complete",
          completed_at,
          total_elapsed_ms: Date.parse(completed_at) - Date.parse(saved.started_at),
          publication_handoff: native.publication_handoff,
          rows: native.rows,
          approved_runs: native.approved_runs,
        })
      }
      const frontier = native.rows.filter((r) => r.reasoning_task)
      const ready = readyArticleItems(ctx.root, frontier)
      const pending = frontier
        .map((r) => {
          const checked = readTask(ctx.root, r.reasoning_task)
          if (!checked.owner || !saved.jobs.some((j) => j.job_id === checked.owner.job_id))
            throw Error("Processing result belongs to another session owner")
          return {
            ...r.reasoning_task,
            candidate_id: r.candidate_id,
            writer_run: r.writer_run,
            owner: checked.owner,
          }
        })
        .filter((r) => readTask(ctx.root, r).status !== "completed")
      if (pending.length > 3)
        throw Error("More than three article requests escaped the dispatch frontier")
      if (!ready.length && pending.length)
        return save({
          status: "requires_reasoning",
          requests: pending,
          ready_items: [],
          failures: native.failures || native.errors || [],
        })
      if (!ready.length && (native.failures?.length || native.errors?.length))
        return save({ status: "failed", failures: native.failures || native.errors })
      const frontier_sha256 = sha256(
        JSON.stringify(
          native.rows
            .map((row) => ({
              candidate_id: row.candidate_id,
              status: row.status,
              writer_run: row.writer_run,
              approved_run: row.approved_run,
              reasoning_task: row.reasoning_task,
              correction_applied: row.correction_applied,
              slice_exhausted: row.slice_exhausted,
            }))
            .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)),
        ),
      )
      const ready_sha256 = sha256(
        JSON.stringify(
          ready
            .map((row) => [row.request_refs, row.result_sha256])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ),
      )
      const attempted = saved.transitions.at(-1)
      if (
        ready.length &&
        attempted?.frontier_sha256 === frontier_sha256 &&
        attempted.ready_sha256 === ready_sha256
      )
        return save({
          status: "no_progress",
          ready_items: ready,
          requests: pending,
          reason:
            "The native successor retained the same completed article frontier; no duplicate writer dispatched",
        })
      saved.transitions.push({
        job_id: last.job_id,
        frontier_sha256,
        ready_sha256,
        ready_items: ready,
        pending: pending.length,
        approved: native.approved_runs?.length || 0,
        at: new Date().toISOString(),
      })
    }
    const job_id =
      "module-processing-" + sha256(JSON.stringify([input, saved.jobs.length])).slice(0, 40)
    saved.jobs.push({ job_id, dispatched_at: new Date().toISOString() })
    // Persist the deterministic next owner before launch. An interrupted launch
    // can inspect/reuse this exact job instead of generating a second writer.
    save({ status: "dispatching", job_id })
    const launched = await submit(ctx, "curation", "advance", sessionParameters(input), {
      jobId: job_id,
      background: true,
    })
    return save({ status: "running", job_id, job: launched })
  })
}

function sessionParameters(input) {
  return {
    run_id: input.run_id,
    selection_path: input.selection.path,
    selection_sha256: input.selection.sha256,
    review_mode: "combined/v1",
    ...(input.review_repair_mode ? { review_repair_mode: input.review_repair_mode } : {}),
    require_completeness: true,
    execute: true,
    max_items: 40,
    max_model_calls: 64,
    time_budget_ms: 3600000,
  }
}
