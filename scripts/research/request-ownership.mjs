import { AsyncLocalStorage } from "node:async_hooks"
import { sha256 } from "./contracts.mjs"
import fs from "node:fs"
import { readJSON, safePath } from "./run-state.mjs"

const owners = new AsyncLocalStorage()
export const currentRequestOwner = () => owners.getStore()
export function withRequestOwner(owner, action) {
  if (
    !/^module-[A-Za-z0-9_-]{1,100}$/.test(owner?.job_id || "") ||
    !/^[a-f0-9]{64}$/.test(owner.input_sha256 || "")
  )
    throw Error("Exact request owner job/SHA required")
  return owners.run(owner, action)
}
export function assertRequestOwner(root, owner) {
  if (!owner) return
  const input = readJSON(root, `module-jobs/${owner.job_id}/input.json`)
  const state = readJSON(root, `module-jobs/${owner.job_id}/state.json`)
  if (
    !input ||
    !state ||
    input.job_id !== owner.job_id ||
    sha256(JSON.stringify(input)) !== owner.input_sha256 ||
    state.input_sha256 !== owner.input_sha256
  )
    throw Error("Reasoning owner job input changed or is missing")
  if (readJSON(root, `module-jobs/${owner.job_id}/retired.json`))
    throw Error("Reasoning owner job is retired")
  if (owner.round_id) {
    if (!/^[A-Za-z0-9_-]{1,70}$/.test(owner.round_id)) throw Error("Invalid request round")
    const round = readJSON(root, `operations/rounds/${owner.round_id}/input.json`)
    if (!round || sha256(JSON.stringify(round)) !== owner.round_input_sha256)
      throw Error("Reasoning round input changed")
  }
}
export function requestOwnerPending(root, request) {
  const owner = request.owner
  if (!owner) return false
  const state = readJSON(root, `module-jobs/${owner.job_id}/state.json`)
  if (state?.state === "waiting_for_reasoning")
    return (
      state.reasoning_task?.task_id === request.task_id &&
      state.reasoning_task?.request_sha256 === request.request_sha256
    )
  if (state?.state !== "completed" || !state.result) return false
  const bytes = fs.readFileSync(safePath(root, state.result.path))
  if (sha256(bytes) !== state.result.sha256) throw Error("Owner result SHA changed")
  const result = JSON.parse(bytes)
  const contains = (value) =>
    value &&
    typeof value === "object" &&
    ((value.task_id === request.task_id && value.request_sha256 === request.request_sha256) ||
      Object.values(value).some(contains))
  return contains(result)
}
