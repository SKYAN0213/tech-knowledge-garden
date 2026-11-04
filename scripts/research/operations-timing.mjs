import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"

const duration = (from, to) => {
  const start = Date.parse(from),
    end = Date.parse(to)
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null
}
const sum = (values) =>
  values.length && values.every((n) => Number.isFinite(n) && n >= 0)
    ? values.reduce((a, b) => a + b, 0)
    : null

export function measureJobTimestamps(state, reasoning = []) {
  return {
    submitted_at: state.submitted_at || null,
    started_at: state.started_at || null,
    queued_at: state.queued_at || null,
    finished_at: state.finished_at || null,
    dispatch_wait_ms: duration(
      state.queued_at || ((state.attempt || 1) === 1 ? state.submitted_at : null),
      state.started_at,
    ),
    native_execution_ms: duration(state.started_at, state.finished_at),
    reasoning_external_wait_ms: reasoning.length
      ? sum(reasoning.map((r) => duration(r.created_at, r.submitted_at)))
      : null,
    reasoning_requests: reasoning.length,
    // Cross-session waiting includes executor, transport and human time. Those
    // components cannot be inferred from request/result timestamps.
    model_execution_ms: null,
    external_transport_ms: null,
    actual_review_ms: null,
    fixed_input_replay_verified: false,
    control_wait_reduction: null,
  }
}

export function moduleJobTiming(root, state) {
  const tasks = new Map()
  const attempts = []
  const cleanupFile = safePath(root, `module-jobs/${state.job_id}/storage-cleanup.json`, { materialize: false })
  const recordedCleanup = fs.existsSync(cleanupFile) ? JSON.parse(fs.readFileSync(cleanupFile)) : null
  const cleanup = recordedCleanup?.attempt === state.attempt ? recordedCleanup : null
  if (cleanup && (cleanup.schema !== "research-storage-cleanup-timing/v1" ||
      cleanup.job_id !== state.job_id || cleanup.input_sha256 !== state.input_sha256 ||
      !["completed", "failed", "skipped", "blocked"].includes(cleanup.status) ||
      (["skipped", "blocked"].includes(cleanup.status) &&
        (typeof cleanup.reason !== "string" || !cleanup.reason.trim())) ||
      !Number.isSafeInteger(cleanup.elapsed_ms) || cleanup.elapsed_ms < 0 ||
      !Number.isFinite(Date.parse(cleanup.started_at)) ||
      !Number.isFinite(Date.parse(cleanup.finished_at))))
    throw Error("Storage cleanup timing binding changed")
  const include = (value) => {
    if (value?.reasoning_task) tasks.set(value.reasoning_task.task_id, value.reasoning_task)
  }
  include(state)
  const directory = safePath(root, `module-jobs/${state.job_id}/attempts`, { materialize: false })
  if (fs.existsSync(directory))
    for (const name of fs.readdirSync(directory)) {
      if (!/^\d{6}-before-resume\.json$/.test(name)) continue
      const attempt = readJSON(root, `module-jobs/${state.job_id}/attempts/${name}`)
      if (attempt.input_sha256 !== state.input_sha256) throw Error("Timing attempt input changed")
      include(attempt.state)
      attempts.push(attempt.state)
    }
  const reasoning = [...tasks.values()].map((task) => {
    if (!/^reasoning-[a-f0-9]{64}$/.test(task.task_id)) throw Error("Invalid timing task identity")
    const base = `reasoning-tasks/${task.task_id}/`
    const creation = readJSON(root, base + "created.json"),
      result = readJSON(root, base + "result.json")
    if (creation && creation.request_sha256 !== task.request_sha256)
      throw Error("Timing request binding changed")
    if (result) {
      const { result_sha256, ...body } = result
      if (
        body.request_sha256 !== task.request_sha256 ||
        body.task_id !== task.task_id ||
        result_sha256 !== sha256(JSON.stringify(body))
      )
        throw Error("Timing result binding changed")
    }
    return {
      task_id: task.task_id,
      created_at: creation?.created_at || null,
      submitted_at: result?.submitted_at || null,
    }
  })
  attempts.push(state)
  const timings = attempts.map((attempt) => ({
    attempt: attempt.attempt,
    ...measureJobTimestamps(attempt),
  }))
  return {
    ...measureJobTimestamps(state, reasoning),
    requests: reasoning,
    attempts: timings,
    dispatch_wait_ms: sum(timings.map((t) => t.dispatch_wait_ms)),
    native_execution_ms: sum(timings.map((t) => t.native_execution_ms)),
    storage_cleanup_ms: cleanup && ["completed", "failed"].includes(cleanup.status)
      ? cleanup.elapsed_ms : null,
    storage_cleanup_decision_ms: cleanup && ["skipped", "blocked"].includes(cleanup.status)
      ? cleanup.elapsed_ms : null,
    storage_cleanup_status: cleanup?.status ?? null,
    storage_cleanup_reason: cleanup?.reason ?? null,
    storage_cleanup_trigger: cleanup?.trigger ?? null,
    storage_cleanup_next_check_at: cleanup?.next_check_at ?? null,
  }
}

export function summarizeStageTiming(commands) {
  return Object.fromEntries(
    [...new Set(commands.map((c) => c.stage))].map((stage) => {
      const jobs = commands.filter((c) => c.stage === stage).map((c) => c.job.timing)
      const starts = jobs.map((job) => job?.started_at).filter((value) => Number.isFinite(Date.parse(value || "")))
      const ends = jobs.map((job) => job?.finished_at).filter((value) => Number.isFinite(Date.parse(value || "")))
      const first = starts.length === jobs.length ? starts.toSorted((a, b) => Date.parse(a) - Date.parse(b))[0] : null
      const last = ends.length === jobs.length ? ends.toSorted((a, b) => Date.parse(a) - Date.parse(b)).at(-1) : null
      const measuredCleanup = jobs.map((job) => job?.storage_cleanup_ms).filter((value) => Number.isFinite(value))
      return [
        stage,
        {
          jobs: jobs.length,
          first_started_at: first,
          last_finished_at: last,
          observed_span_ms: duration(first, last),
          dispatch_wait_ms: sum(jobs.map((j) => j?.dispatch_wait_ms)),
          native_execution_ms: sum(jobs.map((j) => j?.native_execution_ms)),
          storage_cleanup_ms: sum(jobs.map((j) => j?.storage_cleanup_ms)),
          storage_cleanup_observed_ms: measuredCleanup.length ? measuredCleanup.reduce((a, b) => a + b, 0) : null,
          storage_cleanup_measured_jobs: measuredCleanup.length,
          storage_cleanup_skipped_jobs: jobs.filter((job) => job?.storage_cleanup_status === "skipped").length,
          storage_cleanup_blocked_jobs: jobs.filter((job) => job?.storage_cleanup_status === "blocked").length,
          reasoning_external_wait_ms: sum(jobs.map((j) => j?.reasoning_external_wait_ms)),
          aggregation: "sum_of_job_durations_not_wall_clock",
          fixed_input_replay_verified: false,
        },
      ]
    }),
  )
}

// Durations come from the exact saved native publication receipt. Do not
// retrieve GitHub here or treat an unverified timestamp as deployment proof.
export function summarizeDeliveryTiming(root, delivery) {
  const execution = delivery?.execution
  const partial = {
    status: "not_available",
    last_delivery_execution_ms: duration(execution?.started_at, execution?.completed_at),
    ci_observed_span_ms: null, build_ms: null, deploy_ms: null,
    authoring_verified_at: null, remote_verified_at: null, pure_network_ms: null,
  }
  const run = delivery?.publication?.run_id
  if (!run) return partial
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run)) throw Error("Exact publication timing run required")
  const base = `runs/${run}/publication-operation/`
  const proof = readJSON(root, base + "public.json")
  if (!proof) return partial
  const input = readJSON(root, base + "input.json"), deployment = readJSON(root, base + "deployment.json")
  if (!input || !deployment || proof.schema !== "research-publication-operation-readback/v1" ||
      proof.status !== "public_bytes_verified" || proof.input_sha256 !== sha256(JSON.stringify(input)) ||
      proof.deployment_sha256 !== sha256(JSON.stringify(deployment)) ||
      proof.commit !== delivery.publication.commit || deployment.headSha !== proof.commit ||
      deployment.headBranch !== "main" || deployment.status !== "completed" || deployment.conclusion !== "success")
    throw Error("Publication deployment timing binding changed")
  const readbackRef = proof.readback
  if (!readbackRef?.path || !/^[a-f0-9]{64}$/.test(readbackRef.sha256 || ""))
    throw Error("Publication timing readback reference missing")
  const readbackBytes = fs.readFileSync(safePath(root, readbackRef.path))
  if (sha256(readbackBytes) !== readbackRef.sha256) throw Error("Publication timing readback changed")
  const readback = JSON.parse(readbackBytes)
  if (readback.schema !== "publication-readback-receipt/v1" || readback.commit !== proof.commit ||
      readback.verified !== true || readback.status !== "public_artifact_bytes_verified")
    throw Error("Publication timing readback binding changed")
  const jobs = Array.isArray(deployment.jobs) ? deployment.jobs : []
  const one = (names) => {
    const matches = jobs.filter((job) => names.includes(job.name) && job.status === "completed" && job.conclusion === "success")
    return matches.length === 1 ? matches[0] : null
  }
  const build = one(["build", "sync"]), deploy = one(["deploy"])
  const authoringRef = delivery.authoring?.execution
  let authoringAt = null
  if (authoringRef) {
    const bytes = fs.readFileSync(safePath(root, authoringRef.path))
    if (sha256(bytes) !== authoringRef.sha256) throw Error("Authoring timing receipt changed")
    const authoring = JSON.parse(bytes)
    if (authoring.drive_verified === true && Number.isFinite(Date.parse(authoring.observed_at)))
      authoringAt = authoring.observed_at
  }
  let remoteAt = null
  const remoteRef = delivery.remote_delivery?.receipt
  if (remoteRef && delivery.remote_delivery.status === "remote_delivery_complete") {
    const bytes = fs.readFileSync(safePath(root, remoteRef.path))
    if (sha256(bytes) !== remoteRef.sha256) throw Error("Remote delivery timing receipt changed")
    remoteAt = delivery.remote_delivery.observed_at || null
  }
  return { ...partial, status: "verified", commit: proof.commit,
    ci_observed_span_ms: duration(build?.startedAt, deploy?.completedAt),
    build_ms: duration(build?.startedAt, build?.completedAt),
    deploy_ms: duration(deploy?.startedAt, deploy?.completedAt),
    authoring_verified_at: authoringAt,
    remote_verified_at: remoteAt }
}

export function recordOperationalJobTiming(ctx, jobId) {
  if (!ctx.operationalRound) return null
  const round = ctx.operationalRound.round_id
  if (
    !/^[A-Za-z0-9_-]{1,70}$/.test(round || "") ||
    !/^module-[A-Za-z0-9_-]{1,100}$/.test(jobId || "")
  )
    throw Error("Exact operational timing owner required")
  const input = readJSON(ctx.root, `module-jobs/${jobId}/input.json`)
  const state = readJSON(ctx.root, `module-jobs/${jobId}/state.json`)
  if (
    JSON.stringify(input?.context?.operationalRound) !== JSON.stringify(ctx.operationalRound) ||
    state?.input_sha256 !== sha256(JSON.stringify(input))
  )
    throw Error("Operational timing input binding changed")
  if (
    !["completed", "failed", "waiting_for_reasoning", "waiting_for_storage"].includes(state.state)
  )
    return null
  const row = {
    schema: "research-operational-job-timing/v1",
    round_id: round,
    job_id: jobId,
    input_sha256: state.input_sha256,
    state: state.state,
    attempt: state.attempt,
    stage:
      input.module === "publication"
        ? "publication"
        : input.parameters.stop_after_collection
          ? "collection"
          : "processing",
    timing: moduleJobTiming(ctx.root, state),
    scheduled_runs_counted: 0,
  }
  const relative = `operations/rounds/${round}/timing/${sha256(JSON.stringify(row))}.json`
  const expected = sha256(JSON.stringify(row, null, 2) + "\n")
  try {
    if (!readJSON(ctx.root, relative)) atomicCreate(ctx.root, relative, row)
  } catch (error) {
    if (
      error.code !== "EEXIST" &&
      error.message !== "New note destination already exists: " + relative
    )
      throw error
    // The worker and its waiting controller may settle the same receipt together.
    // Reuse only the exact immutable bytes installed by the winning writer.
  }
  if (sha256(fs.readFileSync(safePath(ctx.root, relative))) !== expected)
    throw Error("Operational timing receipt bytes changed")
  return { path: relative, sha256: expected }
}

function intervalTotal(intervals) {
  const sorted = intervals.toSorted((a, b) => a[0] - b[0])
  let total = 0,
    start = null,
    end = null
  for (const [a, b] of sorted) {
    if (start === null) {
      start = a
      end = b
    } else if (a <= end) end = Math.max(end, b)
    else {
      total += end - start
      start = a
      end = b
    }
  }
  return start === null ? 0 : total + end - start
}
export function replayControlTiming(input) {
  if (
    input.schema !== "research-control-timing-replay/v1" ||
    !/^[a-f0-9]{64}$/.test(input.fixed_input_sha256 || "") ||
    !/^[a-f0-9]{64}$/.test(input.expected_output_sha256 || "")
  )
    throw Error("Exact fixed replay input and expected output required")
  const summarize = (trace) => {
    if (
      trace.input_sha256 !== input.fixed_input_sha256 ||
      trace.output_sha256 !== input.expected_output_sha256 ||
      !Array.isArray(trace.stages) ||
      !trace.stages.length ||
      trace.stages.length > 10000
    )
      throw Error("Replay input/output or stage coverage changed")
    const intervals = trace.stages.map((stage) => {
      if (
        !["control", "model", "external", "review"].includes(stage.category) ||
        !stage.stage ||
        !Number.isFinite(stage.start_ms) ||
        !Number.isFinite(stage.end_ms) ||
        stage.start_ms < 0 ||
        stage.end_ms < stage.start_ms
      )
        throw Error("Invalid replay stage timestamps")
      return stage
    })
    const total = intervalTotal(intervals.map((s) => [s.start_ms, s.end_ms]))
    const excluded = intervalTotal(
      intervals.filter((s) => s.category !== "control").map((s) => [s.start_ms, s.end_ms]),
    )
    return {
      total_ms: total,
      control_wait_ms: total - excluded,
      categories_ms: Object.fromEntries(
        ["control", "model", "external", "review"].map((kind) => [
          kind,
          intervalTotal(
            intervals.filter((s) => s.category === kind).map((s) => [s.start_ms, s.end_ms]),
          ),
        ]),
      ),
      stage_ids: [...new Set(intervals.map((s) => s.stage))].sort(),
    }
  }
  const baseline = summarize(input.baseline),
    candidate = summarize(input.candidate)
  if (JSON.stringify(baseline.stage_ids) !== JSON.stringify(candidate.stage_ids))
    throw Error("Replay stage coverage differs")
  return {
    schema: "research-control-timing-replay-result/v1",
    baseline,
    candidate,
    observed_reduction:
      baseline.control_wait_ms > 0
        ? 1 - candidate.control_wait_ms / baseline.control_wait_ms
        : null,
    fixed_input_sha256: input.fixed_input_sha256,
    expected_output_sha256: input.expected_output_sha256,
    runner: "saved_timestamp_replay",
    fixed_input_replay_verified: false,
    acceptance: "actual_baseline_execution_required",
    control_wait_reduction: null,
  }
}

export function runControlTimingReplay(ctx, { path, sha256: expected }) {
  const bytes = fs.readFileSync(safePath(ctx.repo, path))
  if (sha256(bytes) !== expected) throw Error("Replay input SHA changed")
  const result = replayControlTiming(JSON.parse(bytes))
  const destination = ".storage/control-timing-replays/" + expected + ".json"
  const prior = readJSON(ctx.root, destination)
  if (prior && JSON.stringify(prior) !== JSON.stringify(result))
    throw Error("Immutable timing replay changed")
  if (!prior) atomicCreate(ctx.root, destination, result)
  return { ...result, receipt: destination, reused: Boolean(prior) }
}
