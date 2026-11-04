import { sha256 } from "./contracts.mjs"
import { readJSON } from "./run-state.mjs"
import { verifyRelayHistory } from "./relay-ledger.mjs"

const interval = (start, end) => {
  const a = Date.parse(start || ""), b = Date.parse(end || "")
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null
}

function taskKind(request) {
  for (const message of request.input?.messages || []) {
    if (message?.role !== "user" || typeof message.content !== "string") continue
    try {
      const value = JSON.parse(message.content)
      if (["combined_review", "combined_review_repair", "combined_review_correction"].includes(value?.task))
        return value.task
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
    }
  }
  return "other"
}

// This is an explicit, read-only diagnostic, not an approval or a claim about
// pure inference time. It only covers tasks in the owned relay ledger.
export function summarizeRelayTiming(root, round) {
  if (!/^[A-Za-z0-9_-]{1,70}$/.test(round || "")) throw Error("Exact relay round required")
  const pin = readJSON(root, `operations/rounds/${round}/input.json`)
  if (!pin || pin.run_id !== round) throw Error("Relay timing round pin missing")
  const history = verifyRelayHistory(root, round)
  const latest = new Map()
  for (const [index, assignment] of history.assignments.entries())
    latest.set(assignment.task_id, { assignment, reference: history.references[index] })
  const requests = [...latest.values()].map(({ assignment, reference }) => {
    const { task_id: id, request_sha256: requestSha, owner } = assignment
    if (!/^reasoning-[a-f0-9]{64}$/.test(id || "") ||
        !/^module-[A-Za-z0-9_-]{1,100}$/.test(owner?.job_id || "") ||
        owner.round_id !== round || owner.round_input_sha256 !== sha256(JSON.stringify(pin)))
      throw Error("Relay timing owner changed")
    const input = readJSON(root, `module-jobs/${owner.job_id}/input.json`)
    if (!input || sha256(JSON.stringify(input)) !== owner.input_sha256)
      throw Error("Relay timing job input changed")
    const base = `reasoning-tasks/${id}/`
    const request = readJSON(root, base + "request.json")
    if (!request) throw Error("Relay timing request missing")
    const { task_id, request_sha256, ...requestBody } = request
    if (task_id !== id || request_sha256 !== requestSha || id !== "reasoning-" + requestSha ||
        sha256(JSON.stringify(requestBody)) !== requestSha ||
        JSON.stringify(request.owner) !== JSON.stringify(owner))
      throw Error("Relay timing request binding changed")
    const created = readJSON(root, base + "created.json")
    if (created && created.request_sha256 !== requestSha) throw Error("Relay timing creation changed")
    const result = readJSON(root, base + "result.json")
    if (result) {
      const { result_sha256, ...body } = result
      if (sha256(JSON.stringify(body)) !== result_sha256 || body.task_id !== id ||
          body.request_sha256 !== requestSha || JSON.stringify(body.relay_assignment) !== JSON.stringify(reference))
        throw Error("Relay timing result binding changed")
    }
    const createdAt = created?.created_at || null,
      assignedAt = assignment.assigned_at || null,
      submittedAt = result?.submitted_at || null
    return {
      task_id: id, request_sha256: requestSha, candidate_id: assignment.candidate_id || null,
      writer_run: assignment.writer_run, role: request.role, kind: taskKind(request),
      created_at: createdAt, assigned_at: assignedAt, submitted_at: submittedAt,
      queue_wait_ms: interval(createdAt, assignedAt),
      assigned_to_submission_ms: interval(assignedAt, submittedAt),
      request_round_trip_ms: interval(createdAt, submittedAt),
      model_execution_ms: null, external_transport_ms: null, attribution: "caller_declared",
    }
  })
  const articles = new Map()
  for (const request of requests) {
    const key = request.candidate_id || request.writer_run
    const article = articles.get(key) || { candidate_id: request.candidate_id,
      writer_run: request.writer_run, request_count: 0, completed_requests: 0,
      repair_requests: 0, correction_requests: 0, first_request_at: null,
      last_observed_submission_at: null, request_round_trip_sum_ms: 0,
      round_trip_observations: 0 }
    article.request_count++
    if (request.submitted_at) article.completed_requests++
    if (request.kind === "combined_review_repair") article.repair_requests++
    if (request.kind === "combined_review_correction") article.correction_requests++
    if (Number.isFinite(Date.parse(request.created_at)) &&
        (!article.first_request_at || Date.parse(request.created_at) < Date.parse(article.first_request_at)))
      article.first_request_at = request.created_at
    if (Number.isFinite(Date.parse(request.submitted_at)) &&
        (!article.last_observed_submission_at ||
          Date.parse(request.submitted_at) > Date.parse(article.last_observed_submission_at)))
      article.last_observed_submission_at = request.submitted_at
    if (request.request_round_trip_ms !== null) {
      article.request_round_trip_sum_ms += request.request_round_trip_ms
      article.round_trip_observations++
    }
    articles.set(key, article)
  }
  for (const article of articles.values()) {
    if (!article.round_trip_observations) article.request_round_trip_sum_ms = null
    article.observed_request_span_ms = article.completed_requests === article.request_count
      ? interval(article.first_request_at, article.last_observed_submission_at) : null
  }
  return { schema: "research-relay-timing-summary/v1", round_id: round,
    scope: "observed_relay_assignments_only", assignment_count: history.assignments.length,
    unique_request_count: requests.length, requests, articles: [...articles.values()],
    model_execution_ms: null, external_transport_ms: null,
    note: "Request intervals include relay and waiting; they are not pure model time." }
}
