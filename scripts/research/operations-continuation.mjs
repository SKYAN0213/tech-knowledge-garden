import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { executionRepository, assertNoOperationalWriter } from "./operations-deployment.mjs"
import { pinOperationalRound, operationalBase } from "./operations-release.mjs"
import { checkedOperationalInvocation, captureManualInvocation } from "./schedule-contract.mjs"
import { loadDailyPublicationSelection } from "./daily-publication-handoff.mjs"

export function assertUnwrittenApprovedHandoff(ctx, state, run) {
  if (
    state?.status !== "complete" ||
    !state.edition ||
    !state.curation ||
    !state.publication_handoff ||
    state.canonical_writes !== 0 ||
    state.candidate_published !== false ||
    state.stages?.events?.status !== "complete"
  )
    throw Error("Publication recovery requires a complete approved, unwritten handoff")
  checked(ctx.root, state.publication_handoff)
  const handoff = loadDailyPublicationSelection(ctx.root, state.publication_handoff.path, {
    vault: ctx.vault,
  })
  if (
    !handoff.approvedRuns.length ||
    JSON.stringify(handoff.curation) !== JSON.stringify(state.curation)
  )
    throw Error("Publication recovery must retain its exact curated approvals")
  // A request alone has no external effects. Any release binding, execution or
  // publication command beyond that request must remain on its original code.
  const commands = safePath(ctx.root, operationalBase(run) + "commands", { materialize: false })
  const deliveries = new Set([run + "-delivery"])
  for (const name of fs.existsSync(commands) ? fs.readdirSync(commands) : []) {
    if (!name.endsWith(".json")) continue
    const command = readJSON(ctx.root, operationalBase(run) + "commands/" + name)
    if (command.stage !== "publication") continue
    if (command.operation !== "request_delivery")
      throw Error("External publication execution cannot move to another release")
    const id = command.parameters?.run_id
    if (id) deliveries.add(id)
  }
  for (const id of deliveries) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error("Exact delivery identity required")
    const delivery = `runs/${id}/publication-delivery/`
    for (const file of ["binding.json", "latest.json"])
      if (readJSON(ctx.root, delivery + file))
        throw Error("External publication execution cannot move to another release")
    const executions = safePath(ctx.root, delivery + "executions", { materialize: false })
    if (fs.existsSync(executions) && fs.readdirSync(executions).length)
      throw Error("External publication execution cannot move to another release")
    if (readJSON(ctx.root, `runs/${id}/publication-operation/input.json`))
      throw Error("External publication execution cannot move to another release")
  }
  return state.publication_handoff
}

function reference(root, file) {
  return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
}
function checked(root, ref) {
  if (!ref || reference(root, ref.path).sha256 !== ref.sha256)
    throw Error("Continuation evidence changed")
  return readJSON(root, ref.path)
}

function requireUnreviewedSelection(ctx, state, run) {
  if (state.event_workflow) checked(ctx.root, state.event_workflow)
  const selection = checked(ctx.root, state.curation)
  if (!Array.isArray(selection.selected) || selection.selected.length > 40)
    throw Error("Exact native selected handoff required")
  for (const item of selection.selected) {
    const plan = checked(ctx.root, item.execution?.plan)
    const group = item.execution?.group_id
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(plan.run_id || "") ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(group || "")
    )
      throw Error("Exact native selected group required")
    const event = plan.events?.find((event) => event.group_id === group)
    if (!event) throw Error("Selected group is missing from its original plan")
    if (event.action === "reuse") continue
    const binding = readJSON(ctx.root, `event-plans/${plan.run_id}/selections/${group}.json`)
    if (!binding) continue
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(binding.writer_run || ""))
      throw Error("Exact native selected writer required")
    for (const name of ["reviewed-claims", "draft", "approved-article"])
      if (readJSON(ctx.root, `runs/${binding.writer_run}/${name}.json`))
        throw Error("Reviewed or drafted work must stay with its immutable execution")
  }
  const commands = safePath(ctx.root, operationalBase(run) + "commands", { materialize: false })
  for (const name of fs.existsSync(commands) ? fs.readdirSync(commands) : [])
    if (
      name.endsWith(".json") &&
      readJSON(ctx.root, operationalBase(run) + "commands/" + name)?.stage === "publication"
    )
      throw Error("Publication work cannot move to another execution")
  if (readJSON(ctx.root, `runs/${run}-delivery/publication-delivery/input.json`))
    throw Error("Publication work cannot move to another execution")
}

// An explicit, quiescent recovery creates a new execution segment. It never
// replaces the old immutable pin, its jobs, its workflow or scheduler claim.
export async function continueOperationalRound(
  ctx,
  { run_id, successor, reason, approved_handoff = false },
) {
  if (typeof approved_handoff !== "boolean")
    throw Error("Explicit boolean approved_handoff required")
  operationalBase(run_id)
  operationalBase(successor)
  if (run_id === successor || typeof reason !== "string" || !reason.trim() || reason.length > 1000)
    throw Error("Distinct successor and explicit continuation reason required")
  const runtime = executionRepository(ctx)
  const gate = readOperationGate(runtime)
  if (!gate.regular_execution_allowed) return { ...gate, completed: false }
  const base = operationalBase(run_id)
  return withLock(ctx.root, "operational-round-continuation", async () => {
    assertNoOperationalWriter(ctx.repo)
    const parent = readJSON(ctx.root, base + "input.json")
    if (
      !parent ||
      parent.run_id !== run_id ||
      parent.repository !== fs.realpathSync(ctx.repo) ||
      parent.root !== fs.realpathSync(ctx.root)
    )
      throw Error("Exact original operational round required")
    const oldRuntime = parent.execution_repository || parent.repository
    const oldGate = readOperationGate(oldRuntime)
    if (!oldGate.regular_execution_allowed || oldGate.release_id !== parent.release_id)
      throw Error("Original immutable execution evidence is invalid")
    for (const ref of [parent.completion, parent.manifest, parent.policy, parent.installation])
      checked(oldRuntime, ref)
    const originalInvocation = checkedOperationalInvocation(ctx, parent.invocation)
    // Recovery never changes an existing pin. A frozen selected handoff may
    // start a separate manual segment; its original jobs and reviews stay put.
    const workflow = readJSON(ctx.root, `round-workflows/${run_id}/input.json`)
    const state = readJSON(ctx.root, `round-workflows/${run_id}/latest.json`)
    const collectionOnly =
      ["collection_pending", "collection_planned"].includes(state?.status) && !state.edition
    const selectedHandoff =
      ["curation_ready", "waiting_for_reasoning"].includes(state?.status) &&
      state.edition &&
      state.curation &&
      state.article_writes === 0 &&
      state.canonical_writes === 0 &&
      state.candidate_published === false
    const approvedHandoff =
      approved_handoff === true ? assertUnwrittenApprovedHandoff(ctx, state, run_id) : null
    if (
      (!selectedHandoff &&
        !approvedHandoff &&
        (!collectionOnly || workflow?.source?.kind !== "daily")) ||
      (collectionOnly && (state.event_workflow || state.publication_handoff))
    )
      throw Error(
        "Continuation requires a settled collection checkpoint or an unwritten selected handoff",
      )
    if (state.input_sha256 !== sha256(JSON.stringify(workflow)))
      throw Error("Original workflow input changed")
    let origin = workflow,
      originPin = parent,
      depth = 0
    while (origin.source?.kind !== "daily") {
      if (++depth > 8 || !originPin.continuation)
        throw Error("Exact original daily lineage required")
      const link = checked(ctx.root, originPin.continuation)
      origin = checked(ctx.root, link.workflow)
      originPin = checked(ctx.root, link.parent)
    }
    const config = reference(ctx.repo, origin.collection_config.path)
    if (config.sha256 !== origin.collection_config.sha256)
      throw Error("Collection configuration changed; explicit replan required")
    if (
      reference(ctx.repo, "data/research-model-policy-codex.json").sha256 !== workflow.policy.sha256
    )
      throw Error("Collection model policy changed")
    const processing =
      selectedHandoff || approvedHandoff
        ? {
            edition: state.edition,
            curation: state.curation,
            ...(state.plan ? { plan: state.plan } : {}),
          }
        : null
    if (processing) for (const ref of Object.values(processing)) checked(ctx.root, ref)
    if (processing) {
      if (checked(ctx.root, state.edition).daily_run !== origin.source.daily_run)
        throw Error("Selected handoff belongs to another daily collection")
      if (!approvedHandoff) requireUnreviewedSelection(ctx, state, run_id)
    }
    const existingLink = readJSON(ctx.root, base + "continuation.json")
    if (existingLink && (existingLink.successor !== successor || existingLink.reason !== reason))
      throw Error("Round already has another continuation")
    const evidenceFile = base + "continuation-evidence.json"
    const source = {
      parent: reference(ctx.root, base + "input.json"),
      workflow: reference(ctx.root, `round-workflows/${run_id}/input.json`),
      checkpoint: reference(ctx.root, `round-workflows/${run_id}/latest.json`),
      invocation: parent.invocation,
      daily_run: origin.source.daily_run,
      ...(processing ? { processing } : {}),
      ...(approvedHandoff ? { approved_handoff: approvedHandoff } : {}),
      prior_release: parent.release_id,
      release_id: gate.release_id,
      successor,
      reason,
    }
    if (!readJSON(ctx.root, evidenceFile))
      atomicCreate(ctx.root, evidenceFile, {
        schema: "research-operational-continuation/v1",
        ...source,
      })
    const evidence = reference(ctx.root, evidenceFile)
    const saved = checked(ctx.root, evidence)
    for (const key of Object.keys(source))
      if (JSON.stringify(saved[key]) !== JSON.stringify(source[key]))
        throw Error("Continuation source changed")
    const invocation = captureManualInvocation(ctx, {
      execution_id: successor,
      reason: `Continue ${run_id}: ${reason}`.slice(0, 1000),
    })
    const pinned = await pinOperationalRound(ctx, {
      run_id: successor,
      invocation_path: invocation.path,
      invocation_sha256: invocation.sha256,
      continuation: evidence,
    })
    if (pinned.status !== "pinned") return pinned
    const link = {
      schema: "research-operational-continuation-link/v1",
      successor,
      reason,
      evidence,
      successor_pin: reference(ctx.root, operationalBase(successor) + "input.json"),
      original_invocation_kind: originalInvocation.kind,
      scheduled_runs_counted: 0,
    }
    if (!existingLink) atomicCreate(ctx.root, base + "continuation.json", link)
    else if (JSON.stringify(existingLink) !== JSON.stringify(link))
      throw Error("Continuation link changed")
    return {
      status: "continuation_ready",
      original_round: run_id,
      run_id: successor,
      daily_run: source.daily_run,
      source: evidence,
      scheduled_runs_counted: 0,
      next_command: [
        "node",
        "scripts/research-operations.mjs",
        "drive",
        "--round",
        successor,
        "--json",
        JSON.stringify({
          parameters: processing
            ? {
                ...Object.fromEntries(
                  Object.entries(processing).flatMap(([name, ref]) => [
                    [name + "_path", ref.path],
                    [name + "_sha256", ref.sha256],
                  ]),
                ),
                propose: false,
              }
            : {
                daily_run: source.daily_run,
                collection_max_windows: 6,
                collection_time_budget_ms: 300000,
              },
        }),
      ],
    }
  })
}
