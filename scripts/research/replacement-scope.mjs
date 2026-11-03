import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { memoizeVerifiedInput } from "./verified-inputs.mjs"
import { restartReasoningStatus } from "./reasoning-tasks.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const hash = /^[a-f0-9]{64}$/
export function recoveryProducerPath(childRun, owner, focusGroup) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(childRun || "") || !owner?.job_id || !owner?.input_sha256 ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(focusGroup || ""))
    throw Error("Exact recovery child producer required")
  return `event-workflows/${childRun}/producers/${sha256(JSON.stringify([owner, focusGroup]))}.json`
}
function checked(root, ref) {
  if (!ref || !hash.test(ref.sha256 || "") || typeof ref.path !== "string")
    throw Error("Exact partial recovery evidence required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Partial recovery evidence changed")
  return JSON.parse(bytes)
}

// The worker's already-validated round pin is the sole authority for a
// replacement. Supplying an arbitrary job parameter never grants this scope.
export function partialRecoveryManifest(ctx) {
  if (!ctx.operationalRound) return null
  return memoizeVerifiedInput(ctx, "partial-recovery-manifest", () => {
    const { round_id, round_input_sha256 } = ctx.operationalRound
    const pin = readJSON(ctx.root, `operations/rounds/${round_id}/input.json`)
    if (!pin || sha256(JSON.stringify(pin)) !== round_input_sha256 || pin.run_id !== round_id)
      throw Error("Partial recovery round pin changed")
    if (!pin.continuation) return null
    const continuation = checked(ctx.root, pin.continuation)
    if (!continuation.partial_restart) return null
    const manifest = checked(ctx.root, continuation.partial_restart)
    if (continuation.successor !== round_id || manifest.schema !== "research-partial-restart/v1" ||
        manifest.successor !== round_id || !same(manifest.parent, continuation.parent) ||
        !same(manifest.checkpoint, continuation.checkpoint) ||
        !same(manifest.selection, continuation.processing?.curation) || !Array.isArray(manifest.items) ||
        !Array.isArray(manifest.settled_requests))
      throw Error("Partial recovery manifest is not bound to its round and selection")
    return { ...manifest, manifest_reference: continuation.partial_restart }
  })
}

export function partialRecoveryItem(ctx, plan, group, workKey) {
  const manifest = partialRecoveryManifest(ctx)
  if (!manifest) return null
  const found = manifest.items.filter((item) => same(item.plan, plan) && item.group_id === group)
  if (found.length !== 1 || found[0].work_key !== workKey || !["reuse", "restart"].includes(found[0].action))
    throw Error("Event is outside the exact partial recovery selection")
  const item = found[0]
  if (item.action !== "restart") {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(item.writer_run || "") ||
        item.approval?.path !== `runs/${item.writer_run}/approved-article.json` ||
        !hash.test(item.approval.sha256 || "") ||
        sha256(fs.readFileSync(safePath(ctx.root, item.approval.path))) !== item.approval.sha256)
      throw Error("Preserved partial recovery approval changed")
    return { ...item, successor: manifest.successor, manifest_reference: manifest.manifest_reference }
  }
  for (const prior of item.original_bindings || []) {
    const file = safePath(ctx.root, prior.path)
    const exists = fs.existsSync(file)
    if (prior.sha256 === null ? exists : !exists || sha256(fs.readFileSync(file)) !== prior.sha256)
      throw Error("Original event writer binding changed during partial recovery")
  }
  const writer_run = "event-" + sha256(JSON.stringify([plan, group, manifest.successor])).slice(0, 36)
  return { ...item, successor: manifest.successor, manifest_reference: manifest.manifest_reference, writer_run,
    binding_path: `event-work/${workKey}/successors/${manifest.successor}.json` }
}

export function assertPartialRestartSettled(ctx) {
  const manifest = partialRecoveryManifest(ctx)
  if (!manifest) return
  const parent = checked(ctx.root, manifest.parent)
  if (!parent.run_id) throw Error("Partial recovery parent round missing")
  const expectedReason = `Restart ${parent.run_id} as ${manifest.successor}`
  for (const task of manifest.settled_requests) {
    if (!/^reasoning-[a-f0-9]{64}$/.test(task.task_id || "") || !hash.test(task.request_sha256 || ""))
      throw Error("Exact prior reasoning task required")
    const status = restartReasoningStatus(ctx.root, { ...task, expected_round: parent.run_id,
      reason: expectedReason })
    if (status.status === "pending")
      throw Error("Prior reasoning requests must be settled before partial recovery starts")
  }
}
