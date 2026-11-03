import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { readReasoningTask } from "./reasoning-tasks.mjs"
import { planRelayRequest } from "./relay-scheduling.mjs"

const idPattern = /^[A-Za-z0-9_-]{1,70}$/
const taskPattern = /^reasoning-[a-f0-9]{64}$/
const hashPattern = /^[a-f0-9]{64}$/
const assignmentPattern = /^(reasoning-[a-f0-9]{64})--([a-f0-9]{16})\.json$/
const base = (round) => {
  if (!idPattern.test(round || "")) throw Error("Exact relay round required")
  return `operations/rounds/${round}/relay/assignments/`
}

function checkObservation(root, observation, expected) {
  if (
    !observation ||
    typeof observation.path !== "string" ||
    !hashPattern.test(observation.sha256 || "")
  )
    throw Error("Exact relay actor observation required")
  const bytes = fs.readFileSync(safePath(root, observation.path))
  if (sha256(bytes) !== observation.sha256) throw Error("Relay actor observation changed")
  const value = JSON.parse(bytes)
  if (
    value.schema !== "research-codex-actor-observation/v1" ||
    value.event !== expected.event ||
    value.agent !== expected.agent ||
    value.lane !== expected.lane ||
    value.generation !== expected.generation ||
    (expected.model && value.model !== expected.model) ||
    (expected.thinking && value.thinking !== expected.thinking) ||
    (value.host_authenticated !== undefined && value.host_authenticated !== false) ||
    (value.attribution !== undefined && value.attribution !== "caller_declared") ||
    !Number.isFinite(Date.parse(value.observed_at || ""))
  )
    throw Error("Exact observed relay actor identity required")
  if (
    value.evidence &&
    (typeof value.evidence.path !== "string" ||
      !hashPattern.test(value.evidence.sha256 || "") ||
      sha256(fs.readFileSync(safePath(root, value.evidence.path))) !== value.evidence.sha256)
  )
    throw Error("Relay actor source evidence changed")
  return value
}

export function boundRelayRound(root, request) {
  if (!request.owner?.round_id) return null
  const pin = readJSON(root, `operations/rounds/${request.owner.round_id}/input.json`)
  if (!pin || sha256(JSON.stringify(pin)) !== request.owner.round_input_sha256)
    throw Error("Relay round identity changed")
  return pin.relay_provenance === "v1" ? request.owner.round_id : null
}

export function relayRequired(root, request) {
  if (!boundRelayRound(root, request)) return false
  if (!["fact_extract", "article_write", "evidence_compare"].includes(request.role)) return false
  const state = readJSON(root, `module-jobs/${request.owner.job_id}/state.json`)
  if (
    state?.state === "waiting_for_reasoning" &&
    state.reasoning_task?.task_id === request.task_id
  ) {
    const input = readJSON(root, `module-jobs/${request.owner.job_id}/input.json`)
    return input?.module === "validation" && input.operation === "revise_draft"
  }
  if (state?.state !== "completed" || !state.result) return false
  const bytes = fs.readFileSync(safePath(root, state.result.path))
  if (sha256(bytes) !== state.result.sha256) throw Error("Relay owner result SHA changed")
  const envelope = JSON.parse(bytes)
  if (
    envelope.schema !== "research-module-result/v1" ||
    envelope.input_sha256 !== request.owner.input_sha256
  )
    throw Error("Exact relay owner result required")
  const contains = (value) =>
    Boolean(
      value &&
      typeof value === "object" &&
      ((value.reasoning_task?.task_id === request.task_id &&
        value.reasoning_task?.request_sha256 === request.request_sha256 &&
        typeof value.writer_run === "string" &&
        value.writer_run) ||
        Object.values(value).some(contains)),
    )
  return contains(envelope.data)
}

const assignmentName = (task, agent, lane, generation) =>
  `${task}--${sha256(JSON.stringify([agent, lane, generation])).slice(0, 16)}.json`

function checkedAssignment(root, round, name) {
  const match = assignmentPattern.exec(name || "")
  if (!match) throw Error("Exact relay assignment task required")
  const relative = base(round) + name
  const bytes = fs.readFileSync(safePath(root, relative))
  const value = JSON.parse(bytes)
  const { assignment_sha256, ...body } = value
  if (
    body.schema !== "research-relay-assignment/v1" ||
    body.round_id !== round ||
    body.task_id !== match[1] ||
    name !== assignmentName(body.task_id, body.agent, body.lane, body.generation) ||
    assignment_sha256 !== sha256(JSON.stringify(body))
  )
    throw Error("Relay assignment evidence changed")
  checkObservation(root, body.observation, {
    event: "started",
    agent: body.agent,
    lane: body.lane,
    generation: body.generation,
    model: body.requested_model,
    thinking: body.requested_thinking,
  })
  return { value, ref: { path: relative, sha256: sha256(bytes) } }
}

export function readRelayHistory(root, round, { recover = false } = {}) {
  const directory = safePath(root, base(round).slice(0, -1))
  const files = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((name) => assignmentPattern.test(name))
        .sort()
    : []
  const headPath = `operations/rounds/${round}/relay/ledger.json`
  let head = readJSON(root, headPath)
  if (head) {
    const { ledger_sha256, ...body } = head
    if (
      head.schema !== "research-relay-ledger/v1" ||
      head.round_id !== round ||
      !Array.isArray(head.assignments) ||
      !Array.isArray(head.records) ||
      head.records.length !== head.assignments.length ||
      ledger_sha256 !== sha256(JSON.stringify(body))
    )
      throw Error("Relay ledger history is missing or changed")
  }
  const references = head?.assignments || [],
    assignments = head?.records || []
  const expected = new Set(references.map((ref) => ref.path.slice(base(round).length)))
  const present = new Set(files)
  if (
    references.some(
      (ref, index) =>
        !ref.path.startsWith(base(round)) ||
        !hashPattern.test(ref.sha256 || "") ||
        ref.path !==
          base(round) +
            assignmentName(
              assignments[index]?.task_id,
              assignments[index]?.agent,
              assignments[index]?.lane,
              assignments[index]?.generation,
            ) ||
        !present.has(ref.path.slice(base(round).length)),
    )
  )
    throw Error("Relay ledger history is missing or changed")
  const extra = files.filter((file) => !expected.has(file))
  if (extra.length) {
    if (!recover || extra.length !== 1)
      throw Error("Relay ledger has an uncommitted assignment; recover its exact owner")
    const added = checkedAssignment(root, round, extra[0])
    if (added.value.sequence !== assignments.length + 1)
      throw Error("Relay assignment sequence changed")
    head = relayLedgerValue(round, [...references, added.ref], [...assignments, added.value])
    atomicWrite(root, headPath, head)
    references.push(added.ref)
    assignments.push(added.value)
  }
  const writers = {},
    reviewers = {},
    actorPhases = {}
  for (const [index, value] of assignments.entries()) {
    const { assignment_sha256, ...body } = value
    if (
      value.schema !== "research-relay-assignment/v1" ||
      value.round_id !== round ||
      value.sequence !== index + 1 ||
      assignment_sha256 !== sha256(JSON.stringify(body))
    )
      throw Error("Relay assignment sequence or digest changed")
    const target =
      value.phase_role === "writing"
        ? writers
        : value.phase_role === "final_review"
          ? reviewers
          : null
    if (target) (target[value.writer_run] ||= []).push(value.agent)
    if (actorPhases[value.agent] && actorPhases[value.agent] !== value.phase)
      throw Error("Saved relay actor context crosses article or phase")
    actorPhases[value.agent] = value.phase
  }
  for (const run of Object.keys(writers))
    if (writers[run].some((actor) => (reviewers[run] || []).includes(actor)))
      throw Error("Saved relay actor history overlaps writing and independent review")
  return { writers, reviewers, actorPhases, assignments, references }
}

function relayLedgerValue(round, references, records) {
  const body = {
    schema: "research-relay-ledger/v1",
    round_id: round,
    assignments: references,
    records,
  }
  return { ...body, ledger_sha256: sha256(JSON.stringify(body)) }
}

export function verifyRelayHistory(root, round) {
  const history = readRelayHistory(root, round)
  for (const [index, ref] of history.references.entries()) {
    const checked = checkedAssignment(root, round, ref.path.slice(base(round).length))
    if (
      checked.ref.sha256 !== ref.sha256 ||
      JSON.stringify(checked.value) !== JSON.stringify(history.assignments[index])
    )
      throw Error("Relay assignment changed before final handoff")
  }
  return history
}

const exitPath = (round, { agent, lane, generation }) =>
  `operations/rounds/${round}/relay/exits/${sha256(JSON.stringify([agent, lane, generation]))}.json`

// Call under the relay-round lock when changing a task's executable state.
export function assertRelayTaskQuiescent(root, round, taskId) {
  const history = verifyRelayHistory(root, round)
  for (const entry of history.assignments.filter((item) => item.task_id === taskId)) {
    const exit = readJSON(root, exitPath(round, entry))
    if (!exit || exit.schema !== "research-relay-exit/v1" || exit.round_id !== round ||
        exit.agent !== entry.agent || exit.lane !== entry.lane || exit.generation !== entry.generation)
      throw Error("A prior reasoning relay actor has not exited")
    checkObservation(root, exit.observation, { event: "completed", agent: entry.agent,
      lane: entry.lane, generation: entry.generation })
  }
}

export async function recordRelayObservation(
  root,
  { round_id, event, agent, lane, generation, model, thinking, observed_at, evidence },
) {
  if (
    !idPattern.test(round_id || "") ||
    !["started", "completed"].includes(event) ||
    typeof agent !== "string" ||
    !agent ||
    agent.length > 200 ||
    !Number.isSafeInteger(lane) ||
    lane < 1 ||
    lane > 3 ||
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    !Number.isFinite(Date.parse(observed_at || "")) ||
    (event === "started" &&
      (typeof model !== "string" || !model || typeof thinking !== "string" || !thinking))
  )
    throw Error("Exact caller-declared actor observation required")
  const pin = readJSON(root, `operations/rounds/${round_id}/input.json`)
  if (pin?.run_id !== round_id || pin.relay_provenance !== "v1")
    throw Error("Bound relay policy required")
  if (evidence) {
    if (typeof evidence.path !== "string" || !hashPattern.test(evidence.sha256 || ""))
      throw Error("Exact observation evidence reference required")
    if (sha256(fs.readFileSync(safePath(root, evidence.path))) !== evidence.sha256)
      throw Error("Observation evidence changed")
  }
  const value = {
    schema: "research-codex-actor-observation/v1",
    event,
    agent,
    lane,
    generation,
    ...(model ? { model } : {}),
    ...(thinking ? { thinking } : {}),
    observed_at,
    ...(evidence ? { evidence } : {}),
    attribution: "caller_declared",
    host_authenticated: false,
  }
  const relative = `operations/rounds/${round_id}/relay/observations/${sha256(JSON.stringify(value))}.json`
  return withLock(root, "relay-round-" + round_id, async () => {
    const old = readJSON(root, relative)
    if (old && JSON.stringify(old) !== JSON.stringify(value))
      throw Error("Actor observation changed")
    const observation = old
      ? { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) }
      : atomicCreate(root, relative, value)
    return {
      status: "recorded",
      observation,
      attribution: "caller_declared",
      host_authenticated: false,
    }
  })
}

function assignmentSettled(root, entry) {
  const exit = readJSON(root, exitPath(entry.round_id, entry))
  if (exit) {
    if (
      exit.agent !== entry.agent ||
      exit.lane !== entry.lane ||
      exit.generation !== entry.generation
    )
      throw Error("Relay exit identity changed")
    checkObservation(root, exit.observation, {
      event: "completed",
      agent: entry.agent,
      lane: entry.lane,
      generation: entry.generation,
    })
    return true
  }
  const retired = readJSON(root, `reasoning-tasks/${entry.task_id}/retired.json`)
  if (retired) {
    if (retired.task_id !== entry.task_id || retired.request_sha256 !== entry.request_sha256)
      throw Error("Retired relay request binding changed")
    return true
  }
  return (
    readReasoningTask(root, {
      task_id: entry.task_id,
      request_sha256: entry.request_sha256,
      limit: 1,
    }).status === "completed"
  )
}

export async function recordRelayExit(root, { round_id, agent, lane, generation, observation }) {
  if (
    !idPattern.test(round_id || "") ||
    typeof agent !== "string" ||
    !agent ||
    agent.length > 200 ||
    !Number.isSafeInteger(lane) ||
    lane < 1 ||
    lane > 3 ||
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    !observation ||
    typeof observation.path !== "string" ||
    !hashPattern.test(observation.sha256 || "")
  )
    throw Error("Exact relay exit and observation required")
  return withLock(root, "relay-round-" + round_id, async () => {
    checkObservation(root, observation, { event: "completed", agent, lane, generation })
    const history = readRelayHistory(root, round_id)
    const last = history.assignments.filter((entry) => entry.lane === lane).at(-1)
    if (!last || last.agent !== agent || last.generation !== generation)
      throw Error("Relay exit does not match the current lane actor")
    const value = {
      schema: "research-relay-exit/v1",
      round_id,
      agent,
      lane,
      generation,
      observation,
      attribution: "caller_declared",
    }
    const relative = exitPath(round_id, value)
    const prior = readJSON(root, relative)
    if (prior && JSON.stringify(prior) !== JSON.stringify(value))
      throw Error("Relay exit evidence changed")
    const exit = prior
      ? { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) }
      : atomicCreate(root, relative, value)
    return { status: "observed_exit", exit, attribution: "caller_declared" }
  })
}

export async function recordRelayAssignment(
  root,
  { task_id, request_sha256, agent, lane, generation, observation },
) {
  if (
    !taskPattern.test(task_id || "") ||
    !hashPattern.test(request_sha256 || "") ||
    typeof agent !== "string" ||
    !agent ||
    agent.length > 200 ||
    !Number.isSafeInteger(lane) ||
    lane < 1 ||
    lane > 3 ||
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    !observation
  )
    throw Error("Exact actor, lane, generation and request required")
  const request = readReasoningTask(root, { task_id, request_sha256 })
  const round = request.owner?.round_id
  if (!round || !["reasoning_pending", "completed"].includes(request.status))
    throw Error("Owned round request required")
  const pin = readJSON(root, `operations/rounds/${round}/input.json`)
  if (pin?.relay_provenance !== "v1") throw Error("Bound relay policy required")
  return withLock(root, "relay-round-" + round, async () => {
    const history = readRelayHistory(root, round, { recover: true })
    const name = assignmentName(task_id, agent, lane, generation)
    const relative = base(round) + name
    const prior = readJSON(root, relative)
    if (prior) {
      const checked = checkedAssignment(root, round, name)
      if (
        prior.request_sha256 !== request_sha256 ||
        prior.agent !== agent ||
        prior.lane !== lane ||
        prior.generation !== generation ||
        JSON.stringify(prior.observation) !== JSON.stringify(observation)
      )
        throw Error("Relay assignment is immutable")
      if (
        history.assignments.filter((entry) => entry.task_id === task_id).at(-1)?.sequence !==
        prior.sequence
      )
        throw Error("Relay assignment was superseded")
      if (request.status === "reasoning_pending" && readJSON(root, exitPath(round, prior)))
        throw Error("Relay actor already exited; assign a new actor")
      return {
        status: "assigned",
        assignment: checked.ref,
        writer_run: prior.writer_run,
        phase: prior.phase,
        attribution: "caller_declared",
        native_approval: false,
      }
    }
    if (request.status !== "reasoning_pending")
      throw Error("A completed request cannot receive a new relay assignment")
    const planned = planRelayRequest(root, {
      task_id,
      request_sha256,
      lanes: [{ id: lane, agent, phase: null, busy: false, retiring: false }],
      writers: history.writers,
      reviewers: history.reviewers,
    })
    checkObservation(root, observation, {
      event: "started",
      agent,
      lane,
      generation,
      model: planned.model,
      thinking: planned.think,
    })
    if (planned.action !== "assign") throw Error("Actor must rotate before independent review")
    const otherPhase = history.assignments.find(
      (entry) => entry.agent === agent && entry.phase !== planned.phase,
    )
    if (otherPhase) throw Error("Actor context belongs to another article or phase")
    const knownActor = history.assignments.find((entry) => entry.agent === agent)
    if (knownActor && (knownActor.lane !== lane || knownActor.generation !== generation))
      throw Error("A relay actor cannot move to a different lane or generation")
    if (knownActor && readJSON(root, exitPath(round, knownActor)))
      throw Error("An observed exited actor cannot receive another assignment")
    const active = history.assignments.find(
      (entry) =>
        (entry.task_id === task_id || entry.agent === agent || entry.lane === lane) &&
        !assignmentSettled(root, entry),
    )
    if (active) throw Error("Relay actor or lane has an unresolved assignment")
    const lastOnLane = history.assignments.filter((entry) => entry.lane === lane).at(-1)
    if (lastOnLane && lastOnLane.agent !== agent) {
      const exit = readJSON(root, exitPath(round, lastOnLane))
      if (
        !exit ||
        exit.agent !== lastOnLane.agent ||
        exit.lane !== lane ||
        exit.generation !== lastOnLane.generation ||
        generation !== lastOnLane.generation + 1
      )
        throw Error("Relay actor exit must be observed before replacing its lane")
      const observed = fs.readFileSync(safePath(root, exit.observation.path))
      if (sha256(observed) !== exit.observation.sha256)
        throw Error("Relay exit observation changed")
    }
    if (lastOnLane && lastOnLane.agent === agent && lastOnLane.generation !== generation)
      throw Error("Relay lane generation changed")
    const body = {
      schema: "research-relay-assignment/v1",
      round_id: round,
      task_id,
      request_sha256,
      owner: planned.owner,
      writer_run: planned.writer_run,
      ...(planned.candidate_id ? { candidate_id: planned.candidate_id } : {}),
      phase: planned.phase,
      phase_role: planned.phase_role,
      agent,
      lane,
      generation,
      requested_model: planned.model,
      requested_thinking: planned.think,
      observation,
      attribution: "caller_declared",
      sequence: history.assignments.length + 1,
    }
    const value = { ...body, assignment_sha256: sha256(JSON.stringify(body)) }
    const assignment = atomicCreate(root, relative, value)
    const ledgerPath = `operations/rounds/${round}/relay/ledger.json`
    atomicWrite(
      root,
      ledgerPath,
      relayLedgerValue(round, [...history.references, assignment], [...history.assignments, value]),
    )
    return {
      status: "assigned",
      assignment,
      writer_run: planned.writer_run,
      phase: planned.phase,
      attribution: "caller_declared",
      native_approval: false,
    }
  })
}

export function checkedRelayAssignment(root, request, reference, { allowSettled = false } = {}) {
  if (!relayRequired(root, request)) {
    if (reference) throw Error("Relay assignment is not bound to this request")
    return null
  }
  if (!reference || typeof reference.path !== "string" || !hashPattern.test(reference.sha256 || ""))
    throw Error("Exact relay assignment required")
  const round = request.owner.round_id
  if (!reference.path.startsWith(base(round))) throw Error("Relay assignment path changed")
  const checked = checkedAssignment(root, round, reference.path.slice(base(round).length))
  if (
    reference.path !== checked.ref.path ||
    reference.sha256 !== checked.ref.sha256 ||
    checked.value.request_sha256 !== request.request_sha256 ||
    JSON.stringify(checked.value.owner) !== JSON.stringify(request.owner)
  )
    throw Error("Relay assignment request or owner changed")
  const history = readRelayHistory(root, round)
  const latest = history.assignments.filter((entry) => entry.task_id === request.task_id).at(-1)
  if (
    !latest ||
    latest.sequence !== checked.value.sequence ||
    JSON.stringify(history.references[latest.sequence - 1]) !== JSON.stringify(checked.ref)
  )
    throw Error("Late relay result belongs to a superseded assignment")
  if (!allowSettled && readJSON(root, exitPath(round, checked.value)))
    throw Error("Late relay result belongs to an exited actor")
  return checked.ref
}
