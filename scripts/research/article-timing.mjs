import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const hash = (value) => sha256(JSON.stringify(value))
const hashPattern = /^[a-f0-9]{64}$/
const idPattern = /^[A-Za-z0-9_-]{1,100}$/
const roundPattern = /^[A-Za-z0-9_-]{1,70}$/
const base = (round) => `operations/rounds/${round}/article-timing/`
const seal = (body) => ({ ...body, record_sha256: hash(body) })
const unseal = (value) => {
  if (!value || typeof value !== "object") throw Error("Article timing record missing")
  const { record_sha256, ...body } = value
  if (record_sha256 !== hash(body)) throw Error("Article timing record changed")
  return body
}
const fileBytes = (root, path) => {
  const file = safePath(root, path, { materialize: false })
  return fs.existsSync(file) ? fs.readFileSync(file) : null
}
const exactFile = (root, ref) => {
  if (!ref || typeof ref.path !== "string" || !hashPattern.test(ref.sha256 || ""))
    throw Error("Article timing reference invalid")
  const bytes = fileBytes(root, ref.path)
  if (!bytes) return null
  if (sha256(bytes) !== ref.sha256) throw Error("Article timing reference changed")
  return JSON.parse(bytes)
}
const reference = (root, path) => {
  const bytes = fileBytes(root, path)
  if (!bytes) throw Error("Article timing input missing")
  return { path, sha256: sha256(bytes) }
}

function checkedOwner(root, owner, round, commands = null) {
  if (!roundPattern.test(round || "") || owner?.round_id !== round ||
      !/^module-[A-Za-z0-9_-]{1,100}$/.test(owner?.job_id || "") ||
      !hashPattern.test(owner.input_sha256 || "") ||
      !hashPattern.test(owner.round_input_sha256 || ""))
    throw Error("Article timing owner invalid")
  const pin = readJSON(root, `operations/rounds/${round}/input.json`)
  const input = readJSON(root, `module-jobs/${owner.job_id}/input.json`)
  const state = readJSON(root, `module-jobs/${owner.job_id}/state.json`)
  if (!pin || pin.run_id !== round || hash(pin) !== owner.round_input_sha256 ||
      !input || input.job_id !== owner.job_id || hash(input) !== owner.input_sha256 ||
      state?.input_sha256 !== owner.input_sha256 ||
      input.module !== "edition" || input.operation !== "advance" ||
      input.parameters?.run_id !== round || input.parameters?.round !== true ||
      !equal(input.context?.operationalRound,
        { round_id: round, round_input_sha256: owner.round_input_sha256 }))
    throw Error("Article timing owner binding changed")
  if (commands && !commands.some((command) => command.job_id === owner.job_id &&
      command.stage === "processing" && command.module === input.module &&
      command.operation === input.operation && equal(command.parameters, input.parameters)))
    throw Error("Article timing job is not owned by this round")
  return pin
}

// An old pinned release did not contain this helper, so it must not acquire
// new timing records even if its native workflow has not started yet.
function timingEnabledByPin(pin) {
  if (!pin?.manifest || !(pin.execution_repository || pin.repository)) return false
  const manifest = exactFile(pin.execution_repository || pin.repository, pin.manifest)
  const actual = sha256(fs.readFileSync(fileURLToPath(import.meta.url)))
  return Boolean(manifest?.files?.some((entry) =>
    entry.path === "scripts/research/article-timing.mjs" && entry.sha256 === actual))
}
function candidates(selection) {
  if (!Array.isArray(selection?.selected)) throw Error("Article timing selection invalid")
  const items = selection.selected.map((item) => {
    const plan = item.execution?.plan, group_id = item.execution?.group_id
    if (!hashPattern.test(item.candidate_id || "") || !plan ||
        !hashPattern.test(plan.sha256 || "") || typeof plan.path !== "string" ||
        typeof group_id !== "string" ||
        item.candidate_id !== hash([item.origin_plan, item.group_id]))
      throw Error("Article timing candidate binding changed")
    return { candidate_id: item.candidate_id, plan, group_id }
  })
  if (new Set(items.map((item) => item.candidate_id)).size !== items.length)
    throw Error("Article timing candidate duplicated")
  return items
}
function manifestKey(workflow, selection) { return hash([workflow.path, selection]) }

function checkedManifest(root, manifest, round, commands = null) {
  const body = unseal(manifest)
  if (body.schema !== "research-article-timing/v1" || body.round_id !== round ||
      !idPattern.test(body.workflow_run || "") ||
      body.workflow?.path !== `curation/runs/${body.selection_run}/workflows/${body.workflow_run}/input.json` ||
      !idPattern.test(body.selection_run || ""))
    throw Error("Article timing manifest invalid")
  checkedOwner(root, body.owner, round, commands)
  const workflow = exactFile(root, body.workflow)
  const selection = exactFile(root, body.selection)
  if (!workflow || !selection) return null
  if (workflow.run_id !== body.workflow_run || !equal(workflow.selection, body.selection) ||
      selection.run_id !== body.selection_run || !equal(candidates(selection), body.candidates))
    throw Error("Article timing manifest binding changed")
  return body
}

// Called only while holding the corresponding native curation workflow lock.
export function openArticleTiming(ctx, { owner, inputPath, selectionRef, selection, created, execute }) {
  if (!owner?.round_id || owner.round_id !== ctx.operationalRound?.round_id ||
      owner.round_input_sha256 !== ctx.operationalRound?.round_input_sha256) return null
  const root = ctx.root, round = owner.round_id
  const pin = checkedOwner(root, owner, round)
  const workflow = reference(root, inputPath)
  const key = manifestKey(workflow, selectionRef)
  const directory = base(round) + key + "/"
  let saved = readJSON(root, directory + "manifest.json")
  if (!saved) {
    if (!created || !execute || !timingEnabledByPin(pin)) return null
    const workflowInput = exactFile(root, workflow)
    const manifest = {
      schema: "research-article-timing/v1", round_id: round, owner,
      selection_run: selection.run_id, workflow_run: workflowInput.run_id,
      selection: selectionRef, workflow, candidates: candidates(selection),
    }
    saved = seal(manifest)
    atomicCreate(root, directory + "manifest.json", saved)
  }
  const body = checkedManifest(root, saved, round)
  if (!body || !equal(body.selection, selectionRef) || !equal(body.workflow, workflow) ||
      !equal(body.candidates, candidates(selection)))
    throw Error("Article timing workflow binding changed")
  return { root, round, directory, manifest_sha256: saved.record_sha256, body, owner }
}

function candidateOf(session, candidateId) {
  const found = session.body.candidates.find((item) => item.candidate_id === candidateId)
  if (!found) throw Error("Article timing candidate is not selected")
  return found
}
function eventPath(session, candidateId, kind) {
  if (!hashPattern.test(candidateId || "") || !["start", "approval"].includes(kind))
    throw Error("Article timing event invalid")
  return session.directory + candidateId + "/" + kind + ".json"
}
function childRunFor(root, manifest, candidate) {
  const input = exactFile(root, manifest.workflow)
  if (!input) return null
  return "cur-events-" + hash([input, candidate.plan]).slice(0, 40)
}
function validTime(time) {
  return typeof time === "string" && Number.isFinite(Date.parse(time)) &&
    new Date(time).toISOString() === time
}
function writeOnce(session, candidateId, kind, body) {
  const file = eventPath(session, candidateId, kind)
  const prior = readJSON(session.root, file)
  if (prior) {
    checkedEvent(session.root, session.body, session.manifest_sha256, candidateId, kind, prior, null)
    return
  }
  atomicCreate(session.root, file, seal(body))
}
export function observeArticleStart(session, candidateId, timestamp) {
  if (!session) return
  candidateOf(session, candidateId)
  if (!validTime(timestamp)) throw Error("Article timing clock invalid")
  writeOnce(session, candidateId, "start", {
    schema: "research-article-timing-event/v1", kind: "start",
    manifest_sha256: session.manifest_sha256, candidate_id: candidateId,
    owner: session.owner, observed_at: timestamp,
  })
}
export function observeArticleApproval(session, candidateId, childRun, checkpointRef, timestamp) {
  if (!session) return
  const candidate = candidateOf(session, candidateId)
  if (readJSON(session.root, eventPath(session, candidateId, "approval"))) return
  if (!idPattern.test(childRun || "") || !validTime(timestamp) ||
      checkpointRef?.path !== `event-workflows/${childRun}/checkpoint-outcomes/${checkpointRef?.sha256}.json` ||
      childRunFor(session.root, session.body, candidate) !== childRun)
    throw Error("Article timing checkpoint invalid")
  const checkpoint = exactFile(session.root, checkpointRef)
  const row = checkpoint?.rows?.find((entry) => entry.group_id === candidate.group_id)
  const approvedRun = row?.status === "reused" ? row.approved_run : row?.writer_run
  if (!checkpoint || checkpoint.run_id !== childRun || !equal(checkpoint.curation, session.body.selection) ||
      !equal(checkpoint.plan, candidate.plan) || !["approved", "reused"].includes(row?.status) ||
      !idPattern.test(approvedRun || "") || !checkpoint.approved_runs?.includes(approvedRun)) return
  const approval = reference(session.root, `runs/${approvedRun}/approved-article.json`)
  writeOnce(session, candidateId, "approval", {
    schema: "research-article-timing-event/v1", kind: "approval",
    manifest_sha256: session.manifest_sha256, candidate_id: candidateId,
    owner: session.owner, observed_at: timestamp, status: row.status,
    approval_kind: row.status === "reused" || row.reused === true ? "reused" : "approved",
    checkpoint: checkpointRef, approval, approved_run: approvedRun,
  })
}
function checkedEvent(root, manifest, manifestSha, candidateId, kind, saved, commands) {
  const event = unseal(saved)
  const candidate = manifest.candidates.find((item) => item.candidate_id === candidateId)
  if (!candidate || event.schema !== "research-article-timing-event/v1" ||
      event.kind !== kind || event.manifest_sha256 !== manifestSha ||
      event.candidate_id !== candidateId || !validTime(event.observed_at))
    throw Error("Article timing event binding changed")
  checkedOwner(root, event.owner, manifest.round_id, commands)
  if (kind === "approval") {
    if (!idPattern.test(event.approved_run || "") ||
        event.approval?.path !== `runs/${event.approved_run}/approved-article.json` ||
        !/^event-workflows\/[A-Za-z0-9_-]+\/checkpoint-outcomes\/[a-f0-9]{64}\.json$/.test(event.checkpoint?.path || "") ||
        !event.checkpoint.path.endsWith("/" + event.checkpoint.sha256 + ".json"))
      throw Error("Article timing approval reference invalid")
    const checkpoint = exactFile(root, event.checkpoint)
    const approval = exactFile(root, event.approval)
    if (!checkpoint || !approval) return null
    const child = childRunFor(root, manifest, candidate)
    const row = checkpoint.rows?.find((entry) => entry.group_id === candidate.group_id)
    if (!child || checkpoint.run_id !== child ||
        event.checkpoint.path !== `event-workflows/${child}/checkpoint-outcomes/${event.checkpoint.sha256}.json` ||
        !equal(checkpoint.curation, manifest.selection) || !equal(checkpoint.plan, candidate.plan) ||
        row?.status !== event.status ||
        event.approval_kind !== (row.status === "reused" || row.reused === true ? "reused" : "approved") ||
        (row.status === "reused" ? row.approved_run : row.writer_run) !== event.approved_run ||
        !checkpoint.approved_runs?.includes(event.approved_run))
      throw Error("Article timing native approval changed")
  }
  return event
}

// Pure status read: missing observations and archived evidence remain null.
export function summarizeArticleTiming(root, round, commands) {
  if (!roundPattern.test(round || "")) throw Error("Exact article timing round required")
  const directory = safePath(root, base(round), { materialize: false })
  if (!fs.existsSync(directory)) return null
  const articles = []
  for (const key of fs.readdirSync(directory).sort()) {
    if (!hashPattern.test(key)) throw Error("Article timing directory invalid")
    const prefix = base(round) + key + "/"
    const saved = readJSON(root, prefix + "manifest.json")
    if (!saved) throw Error("Article timing manifest missing")
    const manifest = checkedManifest(root, saved, round, commands)
    if (!manifest) return null
    if (key !== manifestKey(manifest.workflow, manifest.selection))
      throw Error("Article timing manifest identity changed")
    for (const candidate of manifest.candidates) {
      const startSaved = readJSON(root, prefix + candidate.candidate_id + "/start.json")
      const approvalSaved = readJSON(root, prefix + candidate.candidate_id + "/approval.json")
      const start = startSaved && checkedEvent(root, manifest, saved.record_sha256,
        candidate.candidate_id, "start", startSaved, commands)
      const approval = approvalSaved && checkedEvent(root, manifest, saved.record_sha256,
        candidate.candidate_id, "approval", approvalSaved, commands)
      const a = Date.parse(start?.observed_at || ""), b = Date.parse(approval?.observed_at || "")
      articles.push({ candidate_id: candidate.candidate_id, workflow_run: manifest.workflow_run,
        started_at: start?.observed_at || null, approval_observed_at: approval?.observed_at || null,
        approval_status: approval?.approval_kind || null,
        observed_elapsed_ms: Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null })
    }
  }
  return { schema: "research-article-timing-summary/v1", round_id: round, articles,
    note: "Observed elapsed includes model, relay, waiting, and recovery; it is not pure model time." }
}

export function articleTimingStatus(root, round, commands) {
  try { return summarizeArticleTiming(root, round, commands) }
  catch (error) { return { status: "unavailable", articles: null, reason: error.message } }
}
