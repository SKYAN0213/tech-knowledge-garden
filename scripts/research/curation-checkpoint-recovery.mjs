import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { loadCurationSelection } from "./curation.mjs"
import { checkedPlan } from "./event-pipeline.mjs"
import { eventWorkflowFailures, reconcileEventWorkflowCheckpoint } from "./event-workflow.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { eventPublicationStatus } from "./daily-publication-handoff.mjs"
import { currentRequestOwner } from "./request-ownership.mjs"
import { assertNoOperationalWriter, inspectRuntimeWorkspace } from "./operations-deployment.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const encoded = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n")
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
function pinned(root, ref) {
  if (!ref || reference(root, ref.path).sha256 !== ref.sha256)
    throw Error("Recovery evidence changed")
  return readJSON(root, ref.path)
}
function retain(root, file, bytes) {
  if (!fs.existsSync(safePath(root, file, { materialize: false }))) atomicCreate(root, file, bytes)
  const ref = reference(root, file)
  if (ref.sha256 !== sha256(bytes)) throw Error("Recovery snapshot changed")
  return ref
}
const reviewMaps = [
  "fact_reviews",
  "completeness_reviews",
  "editorial_reviews",
  "coverage_reviews",
  "revision_reviews",
]
const resumeFields = [
  ...reviewMaps,
  "max_items",
  "max_model_calls",
  "time_budget_ms",
  "retry_groups",
  "retry_failed",
  "note_review_runs",
]

// Reconcile only an authenticated legacy producer advance. Immutable source,
// selection, run inputs, reviews, approvals and failed attempts remain intact.
export async function recoverCurationCheckpoint(ctx, p) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(p.run_id || "") || !p.reason?.trim())
    throw Error("Exact recovery run and reason required")
  assertNoOperationalWriter(ctx.repo, {
    researchRoot: ctx.root,
    ownedRequest: currentRequestOwner(),
  })
  const selectionRef = { path: p.selection_path, sha256: p.selection_sha256 }
  const selection = loadCurationSelection(ctx, selectionRef)
  const base = `curation/runs/${selection.run_id}/workflows/${p.run_id}/`
  return withLock(ctx.root, "curation-workflow-" + p.run_id, async () => {
    const inputRef = reference(ctx.root, base + "input.json"),
      input = pinned(ctx.root, inputRef)
    if (
      input.run_id !== p.run_id ||
      !same(input.selection, selectionRef) ||
      input.model_policy_sha256 !== sha256(fs.readFileSync(ctx.policy))
    )
      throw Error("Frozen curated recovery input changed")
    const identity = {
      run_id: p.run_id,
      selection: selectionRef,
      expected_parent_sha256: p.expected_parent_sha256,
      expected_children: Object.fromEntries(Object.entries(p.expected_children || {}).sort()),
      resume_input_file: p.resume_input_file || null,
      resume_input_sha256: p.resume_input_sha256 || null,
      failed_job_id: p.failed_job_id || null,
      reason: p.reason,
    }
    const transaction = base + "checkpoint-recoveries/" + sha256(JSON.stringify(identity)) + "/"
    const receiptPath = transaction + "receipt.json",
      oldReceipt = readJSON(ctx.root, receiptPath)
    if (oldReceipt) {
      pinned(ctx.root, oldReceipt.parent_after)
      for (const child of oldReceipt.children) pinned(ctx.root, child.after_snapshot)
      for (const approval of oldReceipt.preserved_approvals) pinned(ctx.root, approval.approval)
      const advanced =
        reference(ctx.root, base + "latest.json").sha256 !== oldReceipt.live_parent.sha256
      return {
        ...oldReceipt,
        ...(advanced ? { progress_changed_since_recovery: true, next_actions: [] } : {}),
        receipt: reference(ctx.root, receiptPath),
      }
    }
    const currentParentRef = reference(ctx.root, base + "latest.json")
    const plannedParent = fs.existsSync(
      safePath(ctx.root, transaction + "parent-planned.json", { materialize: false }),
    )
      ? reference(ctx.root, transaction + "parent-planned.json")
      : null
    const committed = plannedParent && currentParentRef.sha256 === plannedParent.sha256
    if (currentParentRef.sha256 !== p.expected_parent_sha256 && !committed)
      throw Error("Curated recovery parent SHA changed")
    const beforeRef = { path: transaction + "parent-before.json", sha256: p.expected_parent_sha256 }
    const parentBytes = committed
      ? fs.readFileSync(safePath(ctx.root, beforeRef.path))
      : fs.readFileSync(safePath(ctx.root, base + "latest.json"))
    if (sha256(parentBytes) !== p.expected_parent_sha256)
      throw Error("Recovery predecessor changed")
    const parent = JSON.parse(parentBytes)
    if (
      parent.schema !== "research-curation-workflow/v1" ||
      parent.run_id !== p.run_id ||
      !same(parent.selection, selectionRef) ||
      !Array.isArray(parent.workflows)
    )
      throw Error("Native curated recovery checkpoint required")
    const selected = new Set(selection.selected.map((row) => row.candidate_id))
    const resumeRef = p.resume_input_file
      ? { path: p.resume_input_file, sha256: p.resume_input_sha256 }
      : null
    if (Boolean(p.resume_input_file) !== Boolean(p.resume_input_sha256))
      throw Error("Exact resume file/SHA pair required")
    const source = resumeRef ? pinned(ctx.repo, resumeRef) : {}
    const resume = source.parameters || source
    if (Object.keys(resume).some((key) => !resumeFields.includes(key)))
      throw Error("Unknown recovery resume parameter")
    const preparedReviews = []
    for (const key of reviewMaps)
      for (const [candidate, file] of Object.entries(resume[key] || {})) {
        if (!selected.has(candidate) || typeof file !== "string")
          throw Error("Resume review escaped selected candidates")
        preparedReviews.push({ candidate_id: candidate, kind: key, ...reference(ctx.repo, file) })
      }
    let originalJob = null,
      originalRuntime = null
    if (p.failed_job_id) {
      const job = readJSON(ctx.root, `module-jobs/${p.failed_job_id}/input.json`)
      const state = readJSON(ctx.root, `module-jobs/${p.failed_job_id}/state.json`)
      if (
        !job ||
        !state ||
        job.job_id !== p.failed_job_id ||
        sha256(JSON.stringify(job)) !== state.input_sha256 ||
        state.state !== "failed" ||
        job.module !== "edition" ||
        job.operation !== "advance"
      )
        throw Error("Exact original failed native round job required")
      for (const [key, value] of Object.entries(resume))
        if (!same(job.parameters[key], value))
          throw Error("Recovery resume differs from original failed job")
      originalRuntime = job.context.executionRepo || job.context.repo
      inspectRuntimeWorkspace(originalRuntime, ctx.repo)
      originalJob = {
        job_id: job.job_id,
        input_sha256: state.input_sha256,
        execution_repository: originalRuntime,
      }
    }
    const changes = []
    const outcomes = new Map()
    for (const entry of parent.workflows) {
      if (entry.workflow.path !== `event-workflows/${entry.run_id}/latest.json`)
        throw Error("Exact legacy child path required")
      const current = reference(ctx.root, entry.workflow.path)
      if (current.sha256 === entry.workflow.sha256) {
        outcomes.set(entry.run_id, pinned(ctx.root, current))
        continue
      }
      const beforePath = transaction + `child-${entry.run_id}-before.json`
      const storedBefore = readJSON(ctx.root, beforePath)
      const bytes = storedBefore
        ? fs.readFileSync(safePath(ctx.root, beforePath))
        : fs.readFileSync(safePath(ctx.root, entry.workflow.path))
      const expected = p.expected_children?.[entry.run_id]
      if (p.apply && (!expected || sha256(bytes) !== expected))
        throw Error("Observed child SHA must be explicitly confirmed")
      const value = JSON.parse(bytes)
      const nativeInput = reference(ctx.root, `event-workflows/${entry.run_id}/input.json`)
      const binding = pinned(ctx.root, nativeInput)
      const publication = pinned(ctx.root, entry.publication_handoff)
      const predecessor = pinned(ctx.root, publication.workflow?.snapshot)
      if (
        publication.workflow.source.path !== entry.workflow.path ||
        publication.workflow.source.sha256 !== entry.workflow.sha256 ||
        publication.workflow.snapshot.sha256 !== entry.workflow.sha256 ||
        value.schema !== "research-event-workflow/v1" ||
        value.run_id !== entry.run_id ||
        predecessor.run_id !== entry.run_id ||
        !same(value.edition, predecessor.edition) ||
        !same(value.plan, entry.plan) ||
        !same(value.plan, binding.plan) ||
        !same(value.edition, binding.edition) ||
        !same(value.curation, selectionRef) ||
        !same(binding.curation, selectionRef) ||
        binding.policy_sha256 !== input.model_policy_sha256
      )
        throw Error("Legacy predecessor, child input or frozen source binding changed")
      checkedPlan(ctx, entry.plan)
      const corrected = {
        ...value,
        failures: eventWorkflowFailures(value.rows),
        ...(value.rows.some((row) => row.status === "failed") ? { status: "partial" } : {}),
      }
      const plannedSHA = sha256(encoded(corrected))
      if (current.sha256 !== sha256(bytes) && current.sha256 !== plannedSHA)
        throw Error("Child changed outside the recovery transaction")
      changes.push({
        entry,
        before: { path: beforePath, sha256: sha256(bytes) },
        bytes,
        observed_sha256: sha256(bytes),
        planned_sha256: plannedSHA,
        input: nativeInput,
      })
      outcomes.set(entry.run_id, value)
    }
    const expectedKeys = Object.keys(p.expected_children || {})
    if (
      p.apply &&
      (expectedKeys.length !== changes.length ||
        expectedKeys.some((key) => !changes.some((change) => change.entry.run_id === key)))
    )
      throw Error("Recovery child targets must match the exact changed frontier")
    if (!changes.length)
      return { status: "unchanged", parent: currentParentRef, canonical_writes: 0 }
    const approvedBefore = [
      ...new Set([
        ...(parent.approved_runs || []),
        ...[...outcomes.values()].flatMap((value) => value.approved_runs || []),
      ]),
    ].map((run) => {
      loadCurrentApproval(ctx.root, run, { vault: ctx.vault })
      return { run_id: run, approval: reference(ctx.root, `runs/${run}/approved-article.json`) }
    })
    const currentApprovals = new Set(
      [...outcomes.values()].flatMap((value) => value.approved_runs || []),
    )
    if ((parent.approved_runs || []).some((run) => !currentApprovals.has(run)))
      throw Error("Recovery cannot discard a previously approved run")
    const targets = selection.selected
      .filter((item) =>
        changes.some(
          (change) =>
            item.execution.plan.path === change.entry.plan.path &&
            outcomes
              .get(change.entry.run_id)
              .rows.some(
                (row) => row.group_id === item.execution.group_id && row.status === "failed",
              ),
        ),
      )
      .map((item) => item.candidate_id)
    const nextParameters = {
      ...Object.fromEntries(Object.entries(resume).filter(([key]) => key !== "retry_groups")),
      run_id: p.run_id,
      selection_path: selectionRef.path,
      selection_sha256: selectionRef.sha256,
      execute: true,
      require_completeness: input.require_completeness === true,
      ...(input.review_mode ? { review_mode: input.review_mode } : {}),
      ...(targets.length ? { retry_candidates: targets } : {}),
    }
    const nextActions = [
      {
        module: "curation",
        operation: "advance",
        parameters: nextParameters,
        ...(originalRuntime ? { execution_repository: originalRuntime } : {}),
      },
      ...(originalJob
        ? [{ action: "resume_original_native_job_after_curation_settles", ...originalJob }]
        : []),
    ]
    if (!p.apply)
      return {
        status: "recovery_review_ready",
        source_or_approvals_modified: false,
        parent: currentParentRef,
        preserved_approvals: approvedBefore,
        next_actions: nextActions,
        next_input: {
          ...p,
          apply: true,
          expected_children: Object.fromEntries(
            changes.map((change) => [change.entry.run_id, change.observed_sha256]),
          ),
        },
        changed_children: changes.map((change) => ({
          run_id: change.entry.run_id,
          saved: change.entry.workflow,
          observed_sha256: change.observed_sha256,
          planned_sha256: change.planned_sha256,
          predecessor_snapshot_verified: true,
        })),
      }
    retain(ctx.root, beforeRef.path, parentBytes)
    const preservedApprovals = approvedBefore.map((approval) => ({
      run_id: approval.run_id,
      live_approval: approval.approval,
      approval: retain(
        ctx.root,
        transaction + `preserved-approvals/${approval.run_id}.json`,
        fs.readFileSync(safePath(ctx.root, approval.approval.path)),
      ),
    }))
    const transactionInput = retain(
      ctx.root,
      transaction + "input.json",
      encoded({
        schema: "research-curation-checkpoint-recovery-input/v1",
        ...identity,
        input: inputRef,
        parent_before: beforeRef,
        prepared_reviews: preparedReviews,
        original_job: originalJob,
      }),
    )
    const completedChildren = []
    const updated = new Map()
    for (const change of changes) {
      retain(ctx.root, change.before.path, change.bytes)
      const stagePath = transaction + `child-${change.entry.run_id}.json`
      let stage = readJSON(ctx.root, stagePath)
      if (stage) pinned(ctx.root, stage.after)
      else {
        const current = reference(ctx.root, change.entry.workflow.path)
        const outcome = await reconcileEventWorkflowCheckpoint(ctx, {
          run_id: change.entry.run_id,
          expected_sha256: current.sha256,
          expected_input_sha256: change.input.sha256,
        })
        const after = reference(ctx.root, change.entry.workflow.path)
        if (after.sha256 !== change.planned_sha256)
          throw Error("Recovery changed more than failure-frontier metadata")
        stage = {
          run_id: change.entry.run_id,
          before: change.before,
          previous_reference: change.entry.workflow,
          after,
          after_snapshot: reference(
            ctx.root,
            `event-workflows/${change.entry.run_id}/checkpoint-outcomes/${after.sha256}.json`,
          ),
          publication_handoff: outcome.publication_handoff,
        }
        retain(ctx.root, stagePath, encoded(stage))
      }
      if (
        stage.run_id !== change.entry.run_id ||
        stage.before.sha256 !== change.before.sha256 ||
        stage.after.path !== change.entry.workflow.path ||
        stage.after.sha256 !== change.planned_sha256
      )
        throw Error("Recovery child stage binding changed")
      const publication = pinned(ctx.root, stage.publication_handoff)
      if (!same(publication.workflow.source, stage.after))
        throw Error("Recovery handoff source changed")
      const publicationStatus = eventPublicationStatus(ctx, { run_id: publication.run_id })
      if (!same(publicationStatus.publication_handoff, stage.publication_handoff))
        throw Error("Recovery native publication checkpoint changed")
      completedChildren.push(stage)
      updated.set(stage.run_id, {
        ...change.entry,
        status: readJSON(ctx.root, stage.after.path).status,
        workflow: stage.after,
        publication_handoff: stage.publication_handoff,
      })
    }
    const workflows = parent.workflows.map((entry) => updated.get(entry.run_id) || entry)
    const values = workflows.map((entry) => pinned(ctx.root, entry.workflow))
    const rows = workflows.flatMap((entry, i) =>
      values[i].rows.flatMap((row) => {
        const item = selection.selected.find(
          (item) =>
            item.execution.plan.path === entry.plan.path &&
            item.execution.group_id === row.group_id,
        )
        return item
          ? [
              {
                candidate_id: item.candidate_id,
                score: item.score,
                priority: item.priority,
                ...row,
              },
            ]
          : []
      }),
    )
    const afterValue = {
      ...parent,
      status: "processing",
      workflows,
      rows,
      approved_runs: [...new Set(values.flatMap((value) => value.approved_runs || []))],
      failures: values.flatMap((value) => value.failures || []),
      reasoning_tasks: rows
        .filter((row) => row.reasoning_task)
        .map((row) => ({
          candidate_id: row.candidate_id,
          group_id: row.group_id,
          writer_run: row.writer_run,
          ...row.reasoning_task,
        })),
      publication_handoffs: workflows.map((entry) => entry.publication_handoff).filter(Boolean),
      checkpoint_recovery_input: transactionInput,
    }
    delete afterValue.publication_handoff
    const parentPlan = retain(ctx.root, transaction + "parent-planned.json", encoded(afterValue))
    if (!committed) {
      if (reference(ctx.root, base + "latest.json").sha256 !== p.expected_parent_sha256)
        throw Error("Parent changed before recovery commit")
      atomicWrite(ctx.root, base + "latest.json", afterValue)
    } else if (parentPlan.sha256 !== currentParentRef.sha256)
      throw Error("Recovery parent commit changed")
    for (const approval of preservedApprovals) {
      pinned(ctx.root, approval.approval)
      pinned(ctx.root, approval.live_approval)
    }
    const receipt = {
      schema: "research-curation-checkpoint-recovery/v1",
      status: "reconciled",
      input: transactionInput,
      parent_before: beforeRef,
      parent_after: parentPlan,
      live_parent: reference(ctx.root, base + "latest.json"),
      children: completedChildren,
      preserved_approvals: preservedApprovals,
      prepared_reviews: preparedReviews,
      next_actions: nextActions,
      source_or_approvals_modified: false,
      immutable_inputs_modified: false,
      canonical_writes: 0,
      candidate_published: false,
    }
    retain(ctx.root, receiptPath, encoded(receipt))
    return { ...receipt, receipt: reference(ctx.root, receiptPath) }
  })
}
