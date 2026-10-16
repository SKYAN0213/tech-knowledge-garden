import fs from "node:fs"
import path from "node:path"
import { editions, extractArticles } from "../garden.mjs"
import { readBacklog } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { verifyPinnedSourceRevision } from "./candidate-approval.mjs"
import { assertEvidenceOntology, extendEvidenceOntology } from "./ontology.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { checkedEdition, checkedPlan, loadSelectedEvent } from "./event-pipeline.mjs"
import { loadSelectedEventRevision, loadSelectedEventFollowup } from "./event-publication.mjs"
import { loadCurationSelection, curationGroupsForPlan } from "./curation.mjs"
import { loadHistoricalNoteApproval } from "./note-review.mjs"

// Additional Signals/topics are explicit native note approvals, independently
// of the concept approvals attached to individual articles.
export function loadPublicationNoteReferences(ctx, runs = []) {
  if (
    !Array.isArray(runs) ||
    runs.length > 64 ||
    new Set(runs).size !== runs.length ||
    runs.some((run) => typeof run !== "string" || !/^[A-Za-z0-9_-]+$/.test(run))
  )
    throw Error("Distinct explicit signal/topic approval runs required")
  return runs.map((run) => {
    const approved = loadHistoricalNoteApproval(ctx.root, run, { vault: ctx.vault })
    if (!approved.approval.notes.some((note) => /^(Signals|TrendTopics)\//.test(note.path)))
      throw Error("Additional impact approvals require Signals or TrendTopics")
    return { run, files: approved.files }
  })
}

function checkedNoteReferences(ctx, refs = []) {
  if (!Array.isArray(refs)) throw Error("Pinned signal/topic approval references required")
  const current = loadPublicationNoteReferences(
    ctx,
    refs.map((ref) => ref?.run),
  )
  if (!same(refs, current)) throw Error("Signal/topic approval files changed")
  return current
}

// Routing metadata only: privatePreview must still validate every native approval.
export function loadDailyPublicationSelection(root, relative, { vault = "vault" } = {}) {
  const bytes = fs.readFileSync(safePath(root, relative)),
    selection = JSON.parse(bytes)
  if (selection.schema === "research-curation-publication-handoff/v1") {
    const input = pinnedJSON(root, selection.workflow_input)
    const curated = loadCurationSelection({ root, vault }, selection.curation, {
      checkHistory: false,
    })
    if (
      input.schema !== "research-curation-workflow-input/v1" ||
      input.run_id !== selection.run_id ||
      !same(input.selection, selection.curation) ||
      curated.briefing_date !== selection.briefing_date
    )
      throw Error("Curated publication differs from its frozen workflow")
    const children = selection.children.map((child) => {
      if (fileReference(root, child.path).sha256 !== child.sha256)
        throw Error("Curated publication child changed")
      const childHandoff = pinnedJSON(root, child)
      const workflow = pinnedJSON(root, childHandoff.workflow?.snapshot)
      if (!same(workflow.curation, selection.curation))
        throw Error("Publication child is outside curated events")
      return loadDailyPublicationSelection(root, child.path, { vault })
    })
    const runs = [...new Set(children.flatMap((child) => child.approvedRuns))]
    if (!runs.length) throw Error("Curated handoff has no approved authoring changes")
    const knowledgeRuns = [...new Set(children.flatMap((child) => child.knowledgeRuns || []))]
    const noteRefs = checkedNoteReferences({ root, vault }, input.note_review_runs)
    if (noteRefs.some((ref) => !knowledgeRuns.includes(ref.run)))
      throw Error("Curated signal/topic approvals are missing from native child handoffs")
    return {
      approvedRuns: runs,
      knowledgeRuns,
      reference: { path: relative, sha256: sha256(bytes), run_id: selection.run_id },
      curation: selection.curation,
    }
  }
  if (selection.schema === "research-daily-publication-handoff/v3") {
    const result = loadEventPublicationSelection(root, relative, bytes, selection, vault)
    if (!result.approvedRuns.length) throw Error("Event handoff has no approved authoring changes")
    return result
  }
  if (selection.schema === "research-daily-publication-handoff/v2")
    return loadQueuePublicationSelection(root, relative, bytes, selection, vault)
  if (
    selection.schema !== "research-daily-publication-handoff/v1" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(selection.run_id || "") ||
    !Array.isArray(selection.approved_runs) ||
    !selection.approved_runs.length ||
    selection.approved_runs.length > 12
  )
    throw Error("Nonempty exact daily publication selection required")
  const base = `runs/${selection.run_id}/daily-editorial/`
  const input = readJSON(root, base + "input.json"),
    latest = readJSON(root, base + "latest.json")
  if (
    input?.schema !== "research-daily-editorial-input/v1" ||
    latest?.schema !== "research-daily-editorial/v1" ||
    latest.status === "running" ||
    latest.run_id !== selection.run_id ||
    latest.input_sha256 !== sha256(JSON.stringify(input)) ||
    selection.input_sha256 !== latest.input_sha256 ||
    latest.publication_handoff?.path !== relative ||
    latest.publication_handoff.sha256 !== sha256(bytes) ||
    path.resolve(vault) !== input.vault ||
    !Array.isArray(latest.results) ||
    !Array.isArray(input.entries)
  )
    throw Error("Daily publication selection changed or belongs to another vault")
  const ready = latest.results.filter((r) => r.status === "approval_ready")
  const unique = new Map(ready.map((r) => [r.approval.event_id, r.approval]))
  if (JSON.stringify([...unique.values()]) !== JSON.stringify(selection.approved_runs))
    throw Error("Daily publication selection differs from approved editorial results")
  const backlog = readBacklog(input.backlog_file)
  const existing = new Set(
    editions(vault)
      .flatMap(extractArticles)
      .map((a) => a.id),
  )
  for (const row of ready) {
    const matches = backlog?.candidates.filter((c) => c.key === row.candidate_key)
    const candidate = matches?.[0],
      approval = row.approval
    const entry = input.entries.find((e) => e.candidate_key === row.candidate_key)
    const linkBytes = fs.readFileSync(safePath(root, approval.candidate_approval.path))
    const link = JSON.parse(linkBytes)
    const article = readJSON(root, `runs/${approval.approved_run}/approved-article.json`)
    const revised = entry?.source_revision?.sources.find(
      (s) =>
        s.approved_source_version_id === entry.source_version_id &&
        s.approved_parse_id === entry.parse_id,
    )
    if (entry?.source_revision) {
      verifyPinnedSourceRevision({
        root,
        approvedRunId: approval.approved_run,
        candidateKey: row.candidate_key,
        candidate,
        sourceRevision: entry.source_revision,
      })
      if (
        !revised ||
        JSON.stringify(link.source_revision) !== JSON.stringify(entry.source_revision) ||
        JSON.stringify(candidate.approval?.source_revision) !==
          JSON.stringify(entry.source_revision) ||
        link.reviewed_source_version_id !== entry.source_version_id ||
        link.reviewed_parse_id !== entry.parse_id
      )
        throw Error("Daily publication source revision binding changed")
    }
    const sourceVersion = revised?.current_source_version_id || entry?.source_version_id
    const parseId = revised?.current_parse_id || entry?.parse_id
    if (
      matches?.length !== 1 ||
      !entry ||
      approval.current_source_matches !== true ||
      link.schema !== "research-candidate-approval/v1" ||
      sha256(linkBytes) !== approval.candidate_approval.sha256 ||
      link.candidate_key !== row.candidate_key ||
      link.approved_run !== approval.approved_run ||
      link.event_id !== approval.event_id ||
      link.article_sha256 !== approval.article_sha256 ||
      sha256(JSON.stringify(article)) !== approval.article_sha256 ||
      article.event_id !== approval.event_id ||
      candidate.review_status !== "verified" ||
      candidate.event_id !== approval.event_id ||
      candidate.approval?.approved_run !== approval.approved_run ||
      candidate.approval.article_sha256 !== approval.article_sha256 ||
      link.source_version_id !== sourceVersion ||
      link.parse_id !== parseId ||
      candidate.approval.source_version_id !== sourceVersion ||
      candidate.approval.parse_id !== parseId ||
      candidate.article_source_version_id !== sourceVersion ||
      candidate.article_parse_id !== parseId ||
      candidate.article_content_sha256 !== entry.content_sha256 ||
      existing.has(approval.event_id)
    )
      throw Error("Daily publication source changed or event already appears in an edition")
  }
  return {
    approvedRuns: [...new Set(selection.approved_runs.map((a) => a.approved_run))],
    reference: { path: relative, sha256: sha256(bytes), run_id: selection.run_id },
  }
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value)
const handoffBase = (run) => {
  if (!validId(run)) throw Error("Exact event publication run required")
  return `runs/${run}/event-publication/`
}
const fileReference = (root, relative) => ({
  path: relative,
  sha256: sha256(fs.readFileSync(safePath(root, relative))),
})
function pinnedJSON(root, reference) {
  if (!reference || !/^[a-f0-9]{64}$/.test(reference.sha256 || ""))
    throw Error("Exact event publication reference required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Event publication evidence changed")
  return JSON.parse(bytes)
}
function nativeApproval(root, run, vault) {
  const approval = loadCurrentApproval(root, run, { vault })
  return {
    ...approval,
    file_hashes: approval.files,
    draft: readJSON(root, `runs/${run}/draft.json`),
    claims: readJSON(root, `runs/${run}/reviewed-claims.json`).claims,
  }
}
function approvalReference(root, approval) {
  const documents = readJSON(root, `runs/${approval.run}/documents.json`),
    parses = readJSON(root, `runs/${approval.run}/parses.json`)
  return {
    approved_run: approval.run,
    event_id: approval.article.event_id,
    article_sha256: sha256(JSON.stringify(approval.article)),
    published_at: approval.article.article_review.published_at,
    concept_ids: approval.article.article_review.concept_ids || [],
    knowledge_approvals: (approval.concept_review?.notes || []).filter(
      (note) => note.approval_run !== undefined,
    ),
    files: approval.files,
    source_revisions: parses.map((parse) => {
      const document = documents.find((d) => d.source_version_id === parse.source_version_id)
      return {
        source_version_id: parse.source_version_id,
        source_id: parse.source_id,
        original_url: document.original_url,
        body_path: document.body_path,
        body_sha256: document.body_sha256,
        parse_id: parse.parse_id,
        parse_sha256: fileReference(root, `parses/${parse.parse_id}/parse.json`).sha256,
        source_published_at: parse.dates?.published_at || null,
      }
    }),
  }
}

// A small immutable native checkpoint makes old handoffs readable after the
// workflow advances. Sources, parses, drafts and approvals remain references.
function eventSelection(ctx, input, workflow, workflowReference) {
  const { root, vault } = ctx
  const nativeInput = pinnedJSON(root, input.workflow_input)
  const { report } = checkedEdition(ctx, input.edition)
  if (
    workflow.schema !== "research-event-workflow/v1" ||
    workflow.run_id !== input.workflow_run ||
    nativeInput.schema !== "research-event-workflow-input/v1" ||
    nativeInput.run_id !== input.workflow_run ||
    !same(nativeInput.edition, input.edition) ||
    !same(nativeInput.plan, input.plan) ||
    !same(workflow.edition, input.edition) ||
    workflow.collection_status !== report.status ||
    workflow.candidate_published !== false
  )
    throw Error("Event publication differs from its frozen workflow input")
  const noteRefs = checkedNoteReferences(ctx, nativeInput.note_review_runs)
  let rows = [],
    approved = [],
    reused = [],
    excluded = []
  if (!input.plan) {
    if (workflow.status !== "relationship_review" || workflow.approved_runs?.length)
      throw Error("Unreviewed event workflow cannot supply public inputs")
  } else {
    if (!same(workflow.curation || null, nativeInput.curation || null))
      throw Error("Publication curation binding changed")
    const curatedGroups = workflow.curation
      ? curationGroupsForPlan(ctx, workflow.curation, input.plan, { checkHistory: false })
      : null
    // Keep the full pinned plan/review structure, but only reopen raw source
    // bytes for groups selected by the exact curation receipt.
    const plan = checkedPlan(ctx, input.plan, curatedGroups?.length ? curatedGroups[0] : undefined)
    for (const group of curatedGroups?.slice(1) || []) checkedPlan(ctx, input.plan, group)
    if (
      !same(plan.edition, input.edition) ||
      !same(workflow.plan, input.plan) ||
      !Array.isArray(workflow.rows) ||
      !same(
        workflow.rows.map((r) => r.group_id),
        plan.events.map((e) => e.group_id),
      ) ||
      !Array.isArray(workflow.failures) ||
      !same(
        workflow.failures.map((r) => r.group_id),
        workflow.rows.filter((r) => r.status === "failed").map((r) => r.group_id),
      )
    )
      throw Error("Event publication requires exact reviewed workflow outcomes")
    rows = workflow.rows
    const waiting = new Set([
      "queued",
      "fact_review",
      "completeness_review",
      "editorial_review",
      "coverage_review",
      "waiting_for_reasoning",
      "failed",
    ])
    const nativeRuns = []
    const approvalsByRun = new Map()
    const current = (run) => {
      if (!approvalsByRun.has(run)) approvalsByRun.set(run, nativeApproval(root, run, vault))
      return approvalsByRun.get(run)
    }
    for (const [index, row] of rows.entries()) {
      const event = plan.events[index]
      if (row.action !== event.action) throw Error("Event publication action changed")
      const selected = !input.group_ids || input.group_ids.includes(row.group_id)
      if (row.status === "not_selected") {
        if (!curatedGroups || curatedGroups.includes(row.group_id))
          throw Error("Unselected public row requires an exact curation decision")
        if (selected)
          excluded.push({ group_id: row.group_id, action: row.action, status: row.status })
        continue
      }
      if (event.action === "defer") {
        if (row.status !== "deferred") throw Error("Deferred event cannot be a public input")
      } else if (event.action === "reuse") {
        if (row.status !== "reused" || row.approved_run !== event.prior?.run_id)
          throw Error("Reuse requires the exact prior native approval")
        const approval = current(row.approved_run)
        if (approval.article.event_id !== event.prior.event_id)
          throw Error("Reused event identity changed")
        nativeRuns.push(row.approved_run)
        if (selected)
          reused.push({
            group_id: row.group_id,
            action: "reuse",
            ...approvalReference(root, approval),
          })
        continue
      } else if (row.status === "approved") {
        const approval = current(row.writer_run)
        const binding = readJSON(root, `runs/${row.writer_run}/event-selection.json`)
        if (!binding) throw Error("Approved event requires its native selection")
        const selection = loadSelectedEvent(
          ctx,
          {
            run_id: row.writer_run,
            selection_path: binding.path,
            selection_sha256: binding.sha256,
          },
          { requireProcessed: true },
        )
        if (
          selection.group_id !== row.group_id ||
          !same(selection.plan, input.plan) ||
          selection.action !== event.action ||
          row.event_id !== approval.article.event_id ||
          (row.published_at && row.published_at !== approval.article.article_review.published_at)
        )
          throw Error("Public event differs from its exact native selection")
        let revision = null,
          followup = null
        if (["update", "correction"].includes(event.action)) {
          revision = loadSelectedEventRevision(root, current(event.prior.run_id), approval, {
            vault,
          })
          if (!revision)
            throw Error("Public event update requires explicit native revision lineage")
          const receipt = pinnedJSON(root, revision.receipt)
          if (receipt.action !== event.action) throw Error("Public revision action changed")
        } else if (event.prior) {
          followup = loadSelectedEventFollowup(root, row.writer_run, approval.article, { vault })
          if (!followup) throw Error("Public follow-up requires exact native event lineage")
        }
        nativeRuns.push(row.writer_run)
        if (selected)
          approved.push({
            group_id: row.group_id,
            action: event.action,
            ...approvalReference(root, approval),
            selection: binding,
            ...(revision ? { revision } : {}),
            ...(followup ? { followup } : {}),
          })
        continue
      } else if (!waiting.has(row.status)) {
        throw Error("Unreviewed event outcome cannot supply public inputs")
      }
      if (selected)
        excluded.push({ group_id: row.group_id, action: row.action, status: row.status })
    }
    if (!same([...new Set(nativeRuns)], workflow.approved_runs))
      throw Error("Event publication differs from native approved runs")
    const pending = rows.some((r) => waiting.has(r.status))
    const expectedStatus = workflow.failures.length
      ? "partial"
      : rows.some((r) => r.status === "waiting_for_reasoning")
        ? "waiting_for_reasoning"
        : pending
          ? "review_pending"
          : "complete"
    if (
      workflow.status !== expectedStatus &&
      !(workflow.status === "planned" && !rows.some((r) => r.status === "approved"))
    )
      throw Error("Incomplete workflow cannot be marked complete")
    if (
      input.group_ids &&
      input.group_ids.some((group) => !rows.some((row) => row.group_id === group))
    )
      throw Error("Publication groups must belong to the reviewed event plan")
    const events = new Map()
    for (const row of [...approved, ...reused]) {
      const prior = events.get(row.event_id)
      if (
        prior &&
        (prior.approved_run !== row.approved_run || prior.article_sha256 !== row.article_sha256)
      )
        throw Error("Conflicting native publication revisions for one event")
      events.set(row.event_id, row)
    }
    if (workflow.ontology) {
      const graph = assertEvidenceOntology(pinnedJSON(root, workflow.ontology))
      for (const run of new Set(nativeRuns)) {
        const approval = current(run)
        if (
          !graph.inputs.some(
            (r) =>
              r.run === run &&
              r.event_id === approval.article.event_id &&
              same(r.files, approval.files),
          )
        )
          throw Error("Event publication ontology differs from native approvals")
      }
    }
  }
  const status = approved.length
    ? workflow.status === "complete"
      ? "approval_ready"
      : "partial_approval_ready"
    : workflow.status === "complete"
      ? "no_authoring_changes"
      : workflow.status
  return {
    schema: "research-daily-publication-handoff/v3",
    run_id: input.run_id,
    input_sha256: sha256(JSON.stringify(input)),
    workflow: workflowReference,
    edition: input.edition,
    plan: input.plan,
    status,
    workflow_status: workflow.status,
    collection_status: workflow.collection_status,
    approved_runs: approved,
    reused_runs: reused,
    excluded_groups: excluded,
    ...(noteRefs.length ? { note_review_runs: noteRefs } : {}),
    ...(workflow.ontology ? { evidence_ontology: workflow.ontology } : {}),
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
    new_regular_operation_counted: false,
  }
}

export async function prepareEventPublicationHandoff(ctx, p) {
  const base = handoffBase(p.run_id)
  if (
    p.group_ids !== undefined &&
    (!Array.isArray(p.group_ids) ||
      !p.group_ids.length ||
      p.group_ids.length > 500 ||
      p.group_ids.some((group) => !validId(group)) ||
      new Set(p.group_ids).size !== p.group_ids.length)
  )
    throw Error("Distinct exact publication groups required")
  const source = { path: p.workflow_path, sha256: p.workflow_sha256 }
  const workflow = pinnedJSON(ctx.root, source)
  if (!validId(workflow.run_id) || source.path !== `event-workflows/${workflow.run_id}/latest.json`)
    throw Error("Exact native event workflow checkpoint required")
  const workflowInput = fileReference(ctx.root, `event-workflows/${workflow.run_id}/input.json`)
  const nativeInput = pinnedJSON(ctx.root, workflowInput)
  const input = {
    schema: "research-event-publication-input/v1",
    run_id: p.run_id,
    vault: path.resolve(ctx.vault),
    workflow_run: workflow.run_id,
    workflow_input: workflowInput,
    edition: nativeInput.edition,
    plan: nativeInput.plan,
    ...(p.group_ids ? { group_ids: [...p.group_ids].sort() } : {}),
  }
  const snapshotPath = base + `workflow-${source.sha256}.json`
  const workflowReference = { source, snapshot: { path: snapshotPath, sha256: source.sha256 } }
  const selection = eventSelection(ctx, input, workflow, workflowReference)
  return withLock(ctx.root, "event-publication-" + p.run_id, () => {
    const previous = readJSON(ctx.root, base + "input.json")
    if (previous && !same(previous, input))
      throw Error("Event publication input changed; use a new run")
    if (fileReference(ctx.root, source.path).sha256 !== source.sha256)
      throw Error("Event workflow changed during handoff preparation")
    if (!previous) atomicCreate(ctx.root, base + "input.json", input)
    const sourceBytes = fs.readFileSync(safePath(ctx.root, source.path))
    if (sha256(sourceBytes) !== source.sha256)
      throw Error("Event workflow changed during handoff preparation")
    if (!readJSON(ctx.root, snapshotPath)) atomicCreate(ctx.root, snapshotPath, sourceBytes)
    else pinnedJSON(ctx.root, workflowReference.snapshot)
    const bytes = JSON.stringify(selection, null, 2) + "\n"
    const relative = base + `handoff-${sha256(bytes)}.json`
    const handoff = readJSON(ctx.root, relative)
      ? fileReference(ctx.root, relative)
      : atomicCreate(ctx.root, relative, bytes)
    const latest = {
      schema: "research-event-publication-checkpoint/v1",
      run_id: p.run_id,
      input_sha256: sha256(JSON.stringify(input)),
      publication_handoff: handoff,
    }
    if (!same(readJSON(ctx.root, base + "latest.json"), latest))
      atomicWrite(ctx.root, base + "latest.json", latest)
    return publicationState(selection, { ...handoff, run_id: p.run_id })
  })
}

function loadEventPublicationSelection(root, relative, bytes, selection, vault) {
  const base = handoffBase(selection.run_id),
    input = readJSON(root, base + "input.json")
  if (
    input?.schema !== "research-event-publication-input/v1" ||
    input.run_id !== selection.run_id ||
    input.vault !== path.resolve(vault) ||
    selection.input_sha256 !== sha256(JSON.stringify(input)) ||
    relative !== base + `handoff-${sha256(bytes)}.json` ||
    selection.workflow?.snapshot.path !==
      base + `workflow-${selection.workflow?.source.sha256}.json` ||
    selection.workflow?.snapshot.sha256 !== selection.workflow?.source.sha256 ||
    selection.workflow?.source.path !== `event-workflows/${input.workflow_run}/latest.json`
  )
    throw Error("Event publication selection changed or belongs to another vault")
  const workflow = pinnedJSON(root, selection.workflow.snapshot)
  const current = eventSelection({ root, vault }, input, workflow, selection.workflow)
  if (!same(selection, current)) throw Error("Event handoff differs from exact native approvals")
  return {
    approvedRuns: [...new Set(selection.approved_runs.map((row) => row.approved_run))],
    knowledgeRuns: requiredKnowledgeRuns(selection),
    reference: { path: relative, sha256: sha256(bytes), run_id: selection.run_id },
    selection,
  }
}

export function eventPublicationStatus(ctx, { run_id }) {
  const latest = readJSON(ctx.root, handoffBase(run_id) + "latest.json")
  if (!latest)
    return {
      run_id,
      status: "handoff_pending",
      public_input_ready: false,
      candidate_published: false,
      drive_verified: false,
      public_verified: false,
      new_regular_operation_counted: false,
    }
  if (latest.schema !== "research-event-publication-checkpoint/v1" || latest.run_id !== run_id)
    throw Error("Event publication checkpoint changed")
  const bytes = fs.readFileSync(safePath(ctx.root, latest.publication_handoff.path))
  if (sha256(bytes) !== latest.publication_handoff.sha256)
    throw Error("Event publication checkpoint changed")
  const selection = JSON.parse(bytes)
  if (latest.input_sha256 !== selection.input_sha256) throw Error("Event publication input changed")
  const loaded = loadEventPublicationSelection(
    ctx.root,
    latest.publication_handoff.path,
    bytes,
    selection,
    ctx.vault,
  )
  return publicationState(selection, loaded.reference)
}

function publicationState(selection, reference) {
  const approvedRuns = [...new Set(selection.approved_runs.map((row) => row.approved_run))]
  return {
    run_id: selection.run_id,
    status: selection.status,
    workflow_status: selection.workflow_status,
    collection_status: selection.collection_status,
    publication_handoff: reference,
    approved_runs: approvedRuns,
    knowledge_runs: requiredKnowledgeRuns(selection),
    reused_runs: [...new Set(selection.reused_runs.map((row) => row.approved_run))],
    excluded_groups: selection.excluded_groups,
    public_input_ready: approvedRuns.length > 0,
    next_action: approvedRuns.length
      ? "Prepare the existing private preview and request release review"
      : selection.status === "no_authoring_changes"
        ? null
        : "Continue native relationship/fact/editorial review or explicit failed-group retry",
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
    new_regular_operation_counted: false,
  }
}

function requiredKnowledgeRuns(selection) {
  return [
    ...new Set([
      ...selection.approved_runs.flatMap((row) =>
        row.knowledge_approvals.map((note) => note.approval_run),
      ),
      ...(selection.note_review_runs || []).map((ref) => ref.run),
    ]),
  ]
}

function loadQueuePublicationSelection(root, relative, bytes, selection, vault) {
  if (
    !/^[A-Za-z0-9_-]{1,70}$/.test(selection.run_id || "") ||
    !Array.isArray(selection.child_handoffs) ||
    !selection.child_handoffs.length ||
    selection.child_handoffs.length > 40 ||
    new Set(selection.child_handoffs.map((ref) => ref.path)).size !==
      selection.child_handoffs.length ||
    !Array.isArray(selection.approved_runs) ||
    !selection.approved_runs.length ||
    selection.approved_runs.length > 40 ||
    selection.candidate_published !== false ||
    selection.drive_verified !== false ||
    selection.new_regular_operation_counted !== false
  )
    throw Error("Nonempty native queue publication selection required")
  const base = `runs/${selection.run_id}/queue-editorial/`
  const input = readJSON(root, base + "input.json"),
    latest = readJSON(root, base + "latest.json")
  if (
    input?.schema !== "research-queue-editorial-input/v1" ||
    latest?.schema !== "research-queue-editorial/v1" ||
    latest.run_id !== selection.run_id ||
    latest.status === "running" ||
    input.vault !== path.resolve(vault) ||
    latest.input_sha256 !== sha256(JSON.stringify(input)) ||
    selection.input_sha256 !== latest.input_sha256 ||
    latest.publication_handoff?.path !== relative ||
    latest.publication_handoff.sha256 !== sha256(bytes) ||
    !Array.isArray(latest.results) ||
    JSON.stringify(latest.results.map((row) => row.candidate_key)) !==
      JSON.stringify(input.entries.map((entry) => entry.candidate_key)) ||
    JSON.stringify(
      latest.results
        .filter((row) => row.status === "approval_ready")
        .map((row) => row.publication_handoff),
    ) !== JSON.stringify(selection.child_handoffs)
  )
    throw Error("Queue publication differs from its exact editorial checkpoint")
  const events = new Map()
  const ready = latest.results.filter((row) => row.status === "approval_ready")
  for (const [index, ref] of selection.child_handoffs.entries()) {
    const childBytes = fs.readFileSync(safePath(root, ref.path)),
      child = JSON.parse(childBytes)
    const row = ready[index],
      entry = input.entries.find((e) => e.candidate_key === row.candidate_key)
    const childInput = readJSON(root, `runs/${child.run_id}/daily-editorial/input.json`)
    if (
      sha256(childBytes) !== ref.sha256 ||
      child.schema !== "research-daily-publication-handoff/v1" ||
      child.run_id !== `${selection.run_id}-${sha256(row.candidate_key).slice(0, 12)}` ||
      row.editorial_run !== child.run_id ||
      !entry ||
      childInput?.processing_run !== entry.processing_run ||
      childInput.entries?.length !== 1 ||
      childInput.entries[0].candidate_key !== row.candidate_key
    )
      throw Error("Queue publication requires pinned native child handoffs")
    loadDailyPublicationSelection(root, ref.path, { vault })
    for (const approval of child.approved_runs) {
      const old = events.get(approval.event_id)
      if (
        old &&
        (old.approved_run !== approval.approved_run ||
          old.article_sha256 !== approval.article_sha256)
      )
        throw Error("Conflicting queue article approvals for one event")
      events.set(approval.event_id, approval)
    }
  }
  if (JSON.stringify([...events.values()]) !== JSON.stringify(selection.approved_runs))
    throw Error("Queue publication differs from native approved articles")
  if (
    selection.evidence_ontology &&
    JSON.stringify(selection.evidence_ontology) !== JSON.stringify(latest.evidence_ontology)
  )
    throw Error("Queue ontology reference differs from its editorial checkpoint")
  if (selection.evidence_ontology) {
    const graphBytes = fs.readFileSync(safePath(root, selection.evidence_ontology.path))
    if (sha256(graphBytes) !== selection.evidence_ontology.sha256)
      throw Error("Queue evidence ontology bytes changed")
    const graph = assertEvidenceOntology(JSON.parse(graphBytes))
    const previousEvents = []
    if (selection.ontology_base || input.ontology_base) {
      if (JSON.stringify(selection.ontology_base) !== JSON.stringify(input.ontology_base))
        throw Error("Queue ontology base changed")
      const baseBytes = fs.readFileSync(safePath(root, selection.ontology_base.path))
      if (sha256(baseBytes) !== selection.ontology_base.sha256)
        throw Error("Queue ontology base bytes changed")
      const baseGraph = assertEvidenceOntology(JSON.parse(baseBytes))
      const currentGraph = extendEvidenceOntology(
        root,
        baseGraph,
        selection.approved_runs.map((article) => article.approved_run),
        { vault },
      )
      if (JSON.stringify(currentGraph) !== JSON.stringify(graph))
        throw Error("Queue cumulative ontology differs from current approvals")
      previousEvents.push(
        ...baseGraph.nodes
          .filter((node) => node.type === "Event")
          .map((node) => node.id.slice("event:".length)),
      )
    }
    const expected = [
      ...new Set([
        ...previousEvents,
        ...selection.approved_runs.map((article) => article.event_id),
      ]),
    ].sort()
    const actual = graph.nodes
      .filter((node) => node.type === "Event")
      .map((node) => node.id.slice("event:".length))
      .sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error("Queue ontology differs from its approved event selection")
  }
  return {
    approvedRuns: [...new Set(selection.approved_runs.map((a) => a.approved_run))],
    reference: { path: relative, sha256: sha256(bytes), run_id: selection.run_id },
  }
}
