import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { executionRepository, assertNoOperationalWriter } from "./operations-deployment.mjs"
import { pinOperationalRound, operationalBase } from "./operations-release.mjs"
import { checkedOperationalInvocation, captureManualInvocation } from "./schedule-contract.mjs"

function reference(root, file) {
  return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
}
function checked(root, ref) {
  if (!ref || reference(root, ref.path).sha256 !== ref.sha256)
    throw Error("Continuation evidence changed")
  return readJSON(root, ref.path)
}

// An explicit, quiescent recovery creates a new execution segment. It never
// replaces the old immutable pin, its jobs, its workflow or scheduler claim.
export async function continueOperationalRound(ctx, { run_id, successor, reason }) {
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
      state?.status === "curation_ready" &&
      state.edition &&
      state.curation &&
      state.article_writes === 0 &&
      state.canonical_writes === 0 &&
      state.candidate_published === false
    if (
      workflow?.source?.kind !== "daily" ||
      (!collectionOnly && !selectedHandoff) ||
      state.event_workflow ||
      state.publication_handoff
    )
      throw Error(
        "Continuation requires a settled collection checkpoint or an unwritten selected handoff",
      )
    if (state.input_sha256 !== sha256(JSON.stringify(workflow)))
      throw Error("Original workflow input changed")
    const config = reference(ctx.repo, workflow.collection_config.path)
    if (config.sha256 !== workflow.collection_config.sha256)
      throw Error("Collection configuration changed; explicit replan required")
    if (
      reference(ctx.repo, "data/research-model-policy-codex.json").sha256 !== workflow.policy.sha256
    )
      throw Error("Collection model policy changed")
    const processing = selectedHandoff
      ? {
          edition: state.edition,
          curation: state.curation,
          ...(state.plan ? { plan: state.plan } : {}),
        }
      : null
    if (processing) for (const ref of Object.values(processing)) checked(ctx.root, ref)
    const existingLink = readJSON(ctx.root, base + "continuation.json")
    if (existingLink && (existingLink.successor !== successor || existingLink.reason !== reason))
      throw Error("Round already has another continuation")
    const evidenceFile = base + "continuation-evidence.json"
    const source = {
      parent: reference(ctx.root, base + "input.json"),
      workflow: reference(ctx.root, `round-workflows/${run_id}/input.json`),
      checkpoint: reference(ctx.root, `round-workflows/${run_id}/latest.json`),
      invocation: parent.invocation,
      daily_run: workflow.source.daily_run,
      ...(processing ? { processing } : {}),
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
