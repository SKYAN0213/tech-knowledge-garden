import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { readReasoningTask } from "./reasoning-tasks.mjs"
import { readRelayHistory } from "./relay-ledger.mjs"

// The model relay owns execution slots; native jobs continue to own requests and
// all state changes. An actor is one fresh model context, not a slot number.
export function relayPhase(task) {
  if (
    !task ||
    typeof task.writer_run !== "string" ||
    !task.writer_run ||
    typeof task.role !== "string"
  )
    throw Error("Exact article and reasoning role required")
  const component = task.component || ""
  const finalReview =
    task.kind === "combined_review_correction_resolution" ||
    (task.role === "evidence_compare" &&
      (task.kind === "editorial" ||
        /^editorial-dispute/.test(task.kind || "") ||
        /editorial|coverage/.test(component)))
  const role = finalReview
    ? "final_review"
    : task.role === "article_write"
      ? "writing"
      : "source_review"
  return { role, phase: `${role}|${task.writer_run}` }
}

// Returns only a proposed action. The caller serializes native submissions and
// must observe the old actor's completion before accepting a replacement.
export function selectRelayAction(task, lanes, { writers = {}, reviewers = {}, actorPhases = {} } = {}) {
  if (!Array.isArray(lanes) || lanes.length > 3 || !lanes.length)
    throw Error("One to three relay slots required")
  if (
    lanes.some(
      (lane) =>
        !lane || !Number.isSafeInteger(lane.id) || typeof lane.agent !== "string" || !lane.agent,
    ) ||
    new Set(lanes.map((lane) => lane.id)).size !== lanes.length ||
    new Set(lanes.map((lane) => lane.agent)).size !== lanes.length
  )
    throw Error("Unique slot and actor identities required")
  const { role, phase } = relayPhase(task)
  const history =
    role === "writing"
      ? reviewers[task.writer_run] || []
      : role === "final_review"
        ? writers[task.writer_run] || []
        : []
  if (!Array.isArray(history) || history.some((actor) => typeof actor !== "string" || !actor))
    throw Error("Exact actor history required")
  const incompatible = new Set([...history, ...Object.entries(actorPhases)
    .filter(([, oldPhase]) => oldPhase !== phase).map(([actor]) => actor)])
  const free = lanes.filter((lane) => !lane.busy && !lane.retiring)
  const same = free.find((lane) => lane.phase === phase && !incompatible.has(lane.agent))
  if (same) return { action: "assign", lane: same.id, phase, role }
  const fresh = free.find((lane) => !lane.phase && !incompatible.has(lane.agent))
  if (fresh) return { action: "assign", lane: fresh.id, phase, role }
  // Reusing a slot is safe only after its current actor ends and a fresh
  // context is observed. This also permits an idle former reviewer slot to
  // serve a writer through a distinct actor without weakening independence.
  if (free.length) return { action: "rotate", lane: free[0].id, phase, role }
  return { action: "wait", phase, role }
}

// Reserve ready continuations in their existing model contexts before using an
// idle lane for another article. The caller must still serialize assignments,
// actor retirements and native result submission.
export function selectRelayBatch(tasks, lanes, history = {}) {
  if (!Array.isArray(tasks) || !tasks.length || tasks.length > 3)
    throw Error("One to three relay requests required")
  if (
    tasks.some((task) => typeof task?.task_id !== "string" || !task.task_id) ||
    new Set(tasks.map((task) => task.task_id)).size !== tasks.length
  )
    throw Error("Duplicate or unbound relay request")
  if (!Array.isArray(lanes)) throw Error("One to three relay slots required")
  const remaining = lanes.map((lane) => ({ ...lane }))
  const ranked = tasks.map((task, index) => {
    const proposed = selectRelayAction(task, remaining, history)
    const lane = remaining.find((item) => item.id === proposed.lane)
    return {
      task,
      index,
      affinity: proposed.action === "assign" && lane?.phase === proposed.phase,
    }
  })
  ranked.sort((a, b) => Number(b.affinity) - Number(a.affinity) || a.index - b.index)
  return ranked.map(({ task }) => {
    const selected = selectRelayAction(task, remaining, history)
    if (selected.action !== "wait") {
      const lane = remaining.find((item) => item.id === selected.lane)
      if (selected.action === "rotate") lane.retiring = true
      else lane.busy = task.task_id
    }
    const { action: _action, lane: _lane, phase: _phase, phase_role: _phaseRole, ...bound } = task
    return {
      ...bound,
      action: selected.action,
      ...(selected.lane ? { lane: selected.lane } : {}),
      phase: selected.phase,
      phase_role: selected.role,
    }
  })
}

export function recordRelayActor(state, task, lane) {
  const { role } = relayPhase(task)
  if (!lane || typeof lane.agent !== "string" || !lane.agent) throw Error("Exact actor required")
  const field = role === "writing" ? "writers" : role === "final_review" ? "reviewers" : null
  if (!field) return
  const incompatible = field === "writers" ? "reviewers" : "writers"
  if ((state[incompatible]?.[task.writer_run] || []).includes(lane.agent))
    throw Error("The same actor cannot write and independently review an article")
  state[field] ||= {}
  state[field][task.writer_run] = [
    ...new Set([...(state[field][task.writer_run] || []), lane.agent]),
  ]
}

// A restart must not guess whether a previously exposed assignment reached a
// live actor. An incomplete local transition is left for explicit recovery.
export function assertRelayRecovery(state, assignments, { confirmedActiveActors = [] } = {}) {
  if (!Array.isArray(state?.lanes) || !Array.isArray(state?.executions))
    throw Error("Saved relay state required")
  for (const [run, authors] of Object.entries(state.writers || {})) {
    const reviewers = state.reviewers?.[run] || []
    if (
      !Array.isArray(authors) ||
      !Array.isArray(reviewers) ||
      authors.some((actor) => reviewers.includes(actor))
    )
      throw Error("Saved relay actor history overlaps writing and independent review")
  }
  for (const entry of state.executions.filter((item) => item.status === "assigned")) {
    if (!state.lanes.some((lane) => lane.id === entry.lane && lane.busy === entry.task_id))
      throw Error("Relay assignment status unknown; preserve state for recovery")
  }
  for (const lane of state.lanes) {
    const assignment = assignments[lane.id]
    if (lane.retiring && lane.busy)
      throw Error("Relay actor retirement status unknown; preserve state for recovery")
    if (lane.retiring) {
      if (
        assignment?.status !== "retire" ||
        assignment.lane !== lane.id ||
        assignment.agent !== lane.agent ||
        assignment.generation !== lane.generation
      )
        throw Error("Relay actor retirement status unknown; preserve state for recovery")
    } else if (lane.busy) {
      const executions = state.executions.filter(
        (entry) => entry.task_id === lane.busy && entry.status === "assigned",
      )
      const entry = executions[0]
      if (
        executions.length !== 1 ||
        entry.lane !== lane.id ||
        entry.agent !== lane.agent ||
        entry.generation !== lane.generation ||
        assignment?.task_id !== entry.task_id ||
        assignment.request_sha256 !== entry.request_sha256 ||
        assignment.agent !== entry.agent ||
        assignment.generation !== entry.generation
      )
        throw Error("Relay assignment status unknown; preserve state for recovery")
      if (!confirmedActiveActors.includes(lane.agent))
        throw Error("Relay actor liveness unknown; preserve state for recovery")
    }
  }
}

// Obtain the article and model role from the original owner's verified result
// or a stopped standalone correction job, never from a relay caller's guess.
// This operation only proposes an action.
export function planRelayRequest(
  root,
  { task_id, request_sha256, lanes, writers = {}, reviewers = {} },
) {
  const checked = readReasoningTask(root, { task_id, request_sha256, limit: 1 })
  if (checked.status !== "reasoning_pending" || !checked.owner)
    throw Error("An owned pending reasoning request is required")
  const owner = checked.owner
  const state = readJSON(root, `module-jobs/${owner.job_id}/state.json`)
  const request = readJSON(root, `reasoning-tasks/${task_id}/request.json`)
  const { task_id: savedTask, request_sha256: savedSha, ...body } = request || {}
  if (
    savedTask !== task_id ||
    savedSha !== request_sha256 ||
    sha256(JSON.stringify(body)) !== request_sha256
  )
    throw Error("Reasoning request changed during relay planning")
  let content
  try {
    content = JSON.parse(request.input.messages?.[1]?.content)
  } catch {
    throw Error("Exact structured article request required for relay planning")
  }
  if (
    !["fact_extract", "article_write", "evidence_compare"].includes(request.role) ||
    !content ||
    typeof content !== "object" ||
    (request.role !== "fact_extract" && Array.isArray(content))
  )
    throw Error("Unsupported or malformed article relay request")
  const kind = content.kind || content.task || ""
  const component = content.component || null
  if (
    typeof kind !== "string" ||
    (component !== null && typeof component !== "string") ||
    (request.role === "article_write" &&
      ![
        "",
        "combined_review_correction",
        "combined_review_correction_time_repair",
        "combined_review_correction_resolution",
      ].includes(kind)) ||
    (request.role === "evidence_compare" &&
      (![
        "evidence",
        "editorial",
        "combined_review_repair",
        "combined_review_reviewer_reconciliation",
      ].includes(kind) ||
        (kind === "combined_review_repair" && !component)))
  )
    throw Error("Unknown article review phase; preserve the request for diagnosis")
  let runs, candidates
  if (state?.state === "completed" && state.input_sha256 === owner.input_sha256 && state.result) {
    const bytes = fs.readFileSync(safePath(root, state.result.path))
    if (sha256(bytes) !== state.result.sha256) throw Error("Request owner result SHA changed")
    const envelope = JSON.parse(bytes)
    if (
      envelope.schema !== "research-module-result/v1" ||
      envelope.input_sha256 !== owner.input_sha256
    )
      throw Error("Exact request owner result required")
    const rows = []
    const collect = (value) => {
      if (!value || typeof value !== "object") return
      if (
        value.reasoning_task?.task_id === task_id &&
        value.reasoning_task?.request_sha256 === request_sha256 &&
        typeof value.writer_run === "string" &&
        value.writer_run
      )
        rows.push(value)
      for (const child of Object.values(value)) collect(child)
    }
    collect(envelope.data)
    runs = [...new Set(rows.map((row) => row.writer_run))]
    candidates = [...new Set(rows.map((row) => row.candidate_id).filter(Boolean))]
    if (runs.length !== 1 || candidates.length > 1)
      throw Error("One exact owner article for the request required")
  } else if (state?.state === "waiting_for_reasoning") {
    const input = readJSON(root, `module-jobs/${owner.job_id}/input.json`)
    if (
      state.input_sha256 !== owner.input_sha256 ||
      state.reasoning_task?.task_id !== task_id ||
      state.reasoning_task?.request_sha256 !== request_sha256 ||
      input?.schema !== "research-module-job-input/v1" ||
      input.job_id !== owner.job_id ||
      sha256(JSON.stringify(input)) !== owner.input_sha256 ||
      input.module !== "validation" ||
      input.operation !== "revise_draft" ||
      typeof input.parameters?.run_id !== "string" ||
      !input.parameters.run_id ||
      content.run_id !== input.parameters.run_id ||
      request.role !== "article_write" ||
      ![
        "combined_review_correction",
        "combined_review_correction_time_repair",
        "combined_review_correction_resolution",
      ].includes(kind)
    )
      throw Error("Exact standalone correction owner and article required")
    runs = [input.parameters.run_id]
    candidates = []
  } else throw Error("Completed request owner result required")
  const task = {
    writer_run: runs[0],
    role: request.role,
    kind,
    component,
  }
  if (
    (writers[task.writer_run] || []).some((actor) =>
      (reviewers[task.writer_run] || []).includes(actor),
    )
  )
    throw Error("Article actor history already overlaps writing and independent review")
  const pin = owner.round_id && readJSON(root, `operations/rounds/${owner.round_id}/input.json`)
  const history = pin?.relay_provenance === "v1"
    ? readRelayHistory(root, owner.round_id)
    : { writers, reviewers }
  const action = selectRelayAction(task, lanes, history)
  const rechecked = readReasoningTask(root, { task_id, request_sha256, limit: 1 })
  if (
    rechecked.status !== "reasoning_pending" ||
    JSON.stringify(rechecked.owner) !== JSON.stringify(owner)
  )
    throw Error("Reasoning request changed during relay planning")
  return {
    task_id,
    request_sha256,
    owner,
    ...(candidates.length ? { candidate_id: candidates[0] } : {}),
    ...task,
    model: checked.requested_model,
    think: checked.requested_thinking,
    action: action.action,
    ...(action.lane ? { lane: action.lane } : {}),
    phase: action.phase,
    phase_role: action.role,
    attribution: pin?.relay_provenance === "v1" ? "stored_caller_declared_actor_history" : "caller_declared_actor_history",
    native_state_changed: false,
  }
}

// Each request is resolved from its own immutable owner before batch ordering;
// caller-supplied article IDs or phases can never select a different owner.
export function planRelayBatch(root, { requests, lanes, writers = {}, reviewers = {} }) {
  if (!Array.isArray(requests) || !requests.length || requests.length > 3)
    throw Error("One to three relay requests required")
  if (new Set(requests.map((request) => request?.task_id)).size !== requests.length)
    throw Error("Duplicate relay request")
  const bound = requests.map((request) =>
    planRelayRequest(root, { ...request, lanes, writers, reviewers }),
  )
  const protectedRounds = [...new Set(bound.flatMap((item) => {
    const round = item.owner?.round_id
    return round && readJSON(root, `operations/rounds/${round}/input.json`)?.relay_provenance === "v1" ? [round] : []
  }))]
  if (protectedRounds.length && (protectedRounds.length !== 1 || bound.some((item) => item.owner?.round_id !== protectedRounds[0])))
    throw Error("Bound relay batch must belong to one round")
  const history = protectedRounds.length ? readRelayHistory(root, protectedRounds[0]) : { writers, reviewers }
  const planned = selectRelayBatch(bound, lanes, history)
  for (const item of planned) {
    const current = readReasoningTask(root, item)
    if (
      current.status !== "reasoning_pending" ||
      JSON.stringify(current.owner) !== JSON.stringify(item.owner)
    )
      throw Error("Reasoning request changed during batch relay planning")
  }
  return { plans: planned, native_state_changed: false }
}
