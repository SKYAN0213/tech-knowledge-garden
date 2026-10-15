import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"
import { dailyScan, DAILY_CONFIG } from "./daily-scan.mjs"
import { saveCollectionReport } from "./collection-report.mjs"
import { checkedEdition, checkedPlan, freezeEdition } from "./event-pipeline.mjs"
import { advanceEventWorkflow } from "./event-workflow.mjs"
import { loadCurationSelection } from "./curation.mjs"
import {
  ontologyKnowledgeIndex,
  prepareKnowledgeReviewSelections,
  loadKnowledgeConnectionApproval,
} from "./ontology-knowledge.mjs"
import { prepareTrendReviewRuns } from "./ontology-trends.mjs"
import { assertEvidenceOntology } from "./ontology.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import {
  prepareEventPublicationHandoff,
  loadDailyPublicationSelection,
} from "./daily-publication-handoff.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
function checked(root, ref) {
  if (!ref || reference(root, ref.path).sha256 !== ref.sha256)
    throw Error("Round checkpoint SHA changed")
  return readJSON(root, ref.path)
}
function pair(p, name) {
  if (Boolean(p[name + "_path"]) !== Boolean(p[name + "_sha256"]))
    throw Error("Exact round " + name + " path and SHA required together")
  return p[name + "_path"] ? { path: p[name + "_path"], sha256: p[name + "_sha256"] } : null
}
function nextInputs(events) {
  if (events.status === "relationship_review")
    return [
      { stage: "classification", required: ["plan_path", "plan_sha256"] },
      ...(events.proposals?.failures || []).map((failure) => ({
        stage: "classification",
        material_id: failure.material_id,
        proposal_run: failure.run,
        error: failure.error,
        code: failure.code,
        required: [
          "execute",
          ...(["MODEL_CALL_TIMEOUT", "MODEL_RETRY_REQUIRED"].includes(failure.code)
            ? ["retry_failed"]
            : []),
        ],
      })),
      ...(events.proposals?.next_offset != null
        ? [
            {
              stage: "classification",
              offset: events.proposals.next_offset,
              required: ["offset", "execute"],
            },
          ]
        : []),
    ]
  return (events.rows || []).flatMap((row) => {
    const common = { group_id: row.group_id, writer_run: row.writer_run }
    if (row.status === "fact_review")
      return [{ ...common, stage: "evidence", required: ["fact_reviews"] }]
    if (row.status === "completeness_review")
      return [
        {
          ...common,
          stage: "completeness",
          next_input: row.next_input,
          required: ["completeness_reviews"],
        },
      ]
    if (row.status === "coverage_review")
      return [
        {
          ...common,
          stage: "coverage",
          next_input: row.next_input,
          required: ["editorial_reviews", "coverage_reviews"],
        },
      ]
    if (row.status === "editorial_review")
      return [
        {
          ...common,
          stage: "writing",
          next_input: row.next_input,
          required: row.required_review_inputs || ["editorial_reviews"],
        },
      ]
    if (row.status === "waiting_for_reasoning")
      return [
        {
          ...common,
          stage: "reasoning",
          reasoning_task: row.reasoning_task,
          required: ["reasoning_result"],
        },
      ]
    if (row.status === "failed")
      return [{ ...common, stage: "events", error: row.error, required: ["retry_groups"] }]
    if (row.status === "queued") return [{ ...common, stage: "events", required: ["execute"] }]
    return []
  })
}
function defaultKnowledge(ctx, p) {
  const graph = assertEvidenceOntology(checked(ctx.root, p.ontology))
  return ontologyKnowledgeIndex(ctx.root, graph, {
    vault: ctx.vault,
    knowledgeSelections: p.knowledge_selections_file
      ? JSON.parse(fs.readFileSync(safePath(ctx.repo, p.knowledge_selections_file), "utf8"))
      : [],
    trendReviewRuns: p.trend_review_runs || [],
    connectionReviewRun: p.connection_review_run,
  })
}

// One durable lineage around the existing native stages. Semantic decisions,
// canonical writes and remote delivery keep their existing explicit gates.
export async function advanceRoundWorkflow(
  ctx,
  p,
  {
    clock = Date.now,
    collector = (options) => withGardenOperationLock(ctx.root, () => dailyScan(options)),
    reporter = saveCollectionReport,
    freezer = freezeEdition,
    eventProcessor = advanceEventWorkflow,
    knowledgeProcessor = defaultKnowledge,
    publicationProcessor = prepareEventPublicationHandoff,
    baseProvider,
  } = {},
) {
  if (!/^[A-Za-z0-9_-]{1,70}$/.test(p.run_id || "")) throw Error("Safe round ID required")
  for (const [value, max] of [
    [p.max_items ?? 4, 40],
    [p.time_budget_ms ?? 600000, 3600000],
  ])
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw Error("Bounded round execution required")
  for (const value of [p.collection_max_windows, p.collection_time_budget_ms])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 3600000))
      throw Error("Bounded round collection required")
  if (
    (p.collection_max_windows !== undefined || p.collection_time_budget_ms !== undefined) &&
    (!p.collect || !p.execute)
  )
    throw Error("Collection limits require explicit collection execution")
  const suppliedEdition = pair(p, "edition"),
    suppliedReport = pair(p, "report"),
    suppliedPlan = pair(p, "plan"),
    suppliedCuration = pair(p, "curation")
  const ontology = pair(p, "ontology")
  if (
    [Boolean(suppliedEdition), Boolean(suppliedReport), Boolean(p.daily_run)].filter(Boolean)
      .length > 1
  )
    throw Error("Choose one round collection entry")
  if (p.daily_run && !/^[A-Za-z0-9_-]{1,100}$/.test(p.daily_run))
    throw Error("Safe daily collection ID required")
  const base = `round-workflows/${p.run_id}/`
  return withLock(ctx.root, "round-workflow-" + p.run_id, async () => {
    const previousInput = readJSON(ctx.root, base + "input.json")
    const storedCuration = readJSON(ctx.root, base + "curation.json")
    const curationRef = suppliedCuration || storedCuration?.reference || null
    if (storedCuration && suppliedCuration && !same(storedCuration.reference, suppliedCuration))
      throw Error("Round curation selection changed; use a new round")
    if (curationRef) {
      loadCurationSelection(ctx, curationRef)
      if (!storedCuration)
        atomicCreate(ctx.root, base + "curation.json", { reference: curationRef })
    }
    const source = suppliedEdition
      ? { kind: "edition", edition: suppliedEdition }
      : suppliedReport
        ? { kind: "report", report: suppliedReport }
        : p.daily_run
          ? { kind: "daily", daily_run: p.daily_run }
          : previousInput?.source
    if (!source) throw Error("First round requires a daily run, exact report or exact edition")
    if (p.collect && source.kind !== "daily") throw Error("Collection requires a daily round entry")
    const requestedCollectionConfig =
      source.kind === "daily"
        ? p.collection_config_file || previousInput?.collection_config?.path || DAILY_CONFIG
        : null
    const collectionConfig = requestedCollectionConfig
      ? path.isAbsolute(requestedCollectionConfig)
        ? path.relative(ctx.repo, requestedCollectionConfig)
        : requestedCollectionConfig
      : null
    const input = {
      schema: "research-round-workflow-input/v1",
      run_id: p.run_id,
      source,
      repo: fs.realpathSync(ctx.repo),
      vault: fs.realpathSync(ctx.vault),
      policy: { path: ctx.policy, sha256: sha256(fs.readFileSync(ctx.policy)) },
      ...(p.require_curation !== undefined || previousInput?.require_curation !== undefined
        ? { require_curation: p.require_curation ?? previousInput.require_curation }
        : {}),
      ...(p.require_completeness !== undefined || previousInput?.require_completeness !== undefined
        ? { require_completeness: p.require_completeness ?? previousInput.require_completeness }
        : {}),
      ...(collectionConfig ? { collection_config: reference(ctx.repo, collectionConfig) } : {}),
      ...(ontology || previousInput?.ontology_base
        ? { ontology_base: ontology || previousInput.ontology_base }
        : {}),
    }
    if (previousInput && !same(previousInput, input))
      throw Error("Round inputs changed; use a new round")
    if (input.ontology_base) checked(ctx.root, input.ontology_base)
    if (source.edition) checkedEdition(ctx, source.edition)
    if (source.report) checked(ctx.root, source.report)
    if (suppliedPlan) checkedPlan(ctx, suppliedPlan)
    if (!previousInput) atomicCreate(ctx.root, base + "input.json", input)
    const inputHash = sha256(JSON.stringify(input)),
      old = readJSON(ctx.root, base + "latest.json")
    if (old && old.input_sha256 !== inputHash) throw Error("Round checkpoint input changed")
    const started = clock(),
      stages = { ...(old?.stages || {}) }
    let phase = "collection",
      editionRef = old?.edition || source.edition,
      planRef,
      eventRef = old?.event_workflow,
      knowledgeRef = old?.knowledge_index || null,
      publicationRef = old?.publication_handoff
    const persist = (status, extra = {}) => {
      const result = {
        schema: "research-round-workflow/v1",
        run_id: p.run_id,
        input_sha256: inputHash,
        status,
        stages,
        ...(editionRef ? { edition: editionRef } : {}),
        ...(planRef ? { plan: planRef } : {}),
        ...(curationRef ? { curation: curationRef } : {}),
        elapsed_ms: clock() - started,
        model_calls: 0,
        article_writes: 0,
        next_inputs: [],
        ...(eventRef ? { event_workflow: eventRef } : {}),
        ...(knowledgeRef ? { knowledge_index: knowledgeRef } : {}),
        ...(publicationRef ? { publication_handoff: publicationRef } : {}),
        candidate_published: false,
        canonical_writes: 0,
        new_regular_operation_counted: false,
        ...extra,
      }
      atomicWrite(ctx.root, base + "latest.json", result)
      return result
    }
    try {
      if (editionRef) {
        const { report, edition } = checkedEdition(ctx, editionRef)
        stages.collection = {
          status: report.status,
          reference: edition.report,
          reused: true,
          counts: report.counts,
        }
        stages.edition = { status: "frozen", reference: editionRef, reused: true }
      } else {
        if (p.collect) {
          persist("collecting")
          await collector({
            root: ctx.root,
            runId: source.daily_run,
            vault: ctx.vault,
            backlogFile: ctx.backlog,
            configFile: safePath(ctx.repo, collectionConfig),
            mode: !p.execute
              ? "plan-only"
              : readJSON(ctx.root, `daily/runs/${source.daily_run}/plan.json`)
                ? "resume"
                : "execute",
            ...(p.execute
              ? {
                  maxWindows: p.collection_max_windows,
                  timeBudgetMs: Math.min(
                    p.collection_time_budget_ms || p.time_budget_ms || 600000,
                    p.time_budget_ms || 600000,
                  ),
                }
              : {}),
          })
          if (!p.execute) {
            stages.collection = { status: "planned", daily_run: source.daily_run }
            return persist("collection_planned", {
              next_inputs: [
                {
                  stage: "collection",
                  daily_run: source.daily_run,
                  required: ["collect", "execute"],
                },
              ],
            })
          }
        }
        const reportRef =
          source.report || (await reporter({ root: ctx.root, runId: source.daily_run }))
        const report = checked(ctx.root, reportRef)
        if (report.schema !== "research-collection-report/v1")
          throw Error("Native round collection report required")
        stages.collection = {
          status: report.status,
          reference: { path: reportRef.path, sha256: reportRef.sha256 },
          counts: report.counts,
          reused: !p.collect,
        }
        if (report.counts.pending_windows)
          return persist("collection_pending", {
            next_inputs: [
              {
                stage: "collection",
                daily_run: source.daily_run || report.daily_run,
                required: ["daily_run", "collect", "execute"],
              },
            ],
          })
        phase = "edition"
        persist("freezing")
        const existingEdition = suppliedPlan ? checkedPlan(ctx, suppliedPlan).edition : null
        if (
          existingEdition &&
          !same(checkedEdition(ctx, existingEdition).edition.report, stages.collection.reference)
        )
          throw Error("Round plan collection report changed")
        const frozen = existingEdition
          ? { ...existingEdition, reused: true }
          : await freezer(ctx, {
              run_id:
                "round-ed-" + sha256(JSON.stringify([p.run_id, reportRef.sha256])).slice(0, 40),
              report_path: reportRef.path,
              report_sha256: reportRef.sha256,
            })
        editionRef = { path: frozen.path, sha256: frozen.sha256 }
        checkedEdition(ctx, editionRef)
        stages.edition = { status: "frozen", reference: editionRef, reused: Boolean(frozen.reused) }
        persist("frozen")
      }
      const storedPlan = readJSON(ctx.root, base + "plan.json")
      planRef = suppliedPlan || storedPlan?.reference || null
      if (storedPlan && suppliedPlan && !same(storedPlan.reference, suppliedPlan))
        throw Error("Round reviewed plan changed; use a new round")
      if (planRef) {
        const plan = checkedPlan(ctx, planRef)
        if (!same(plan.edition, editionRef)) throw Error("Round plan belongs to another edition")
        if (!storedPlan) atomicCreate(ctx.root, base + "plan.json", { reference: planRef })
      }
      if (planRef && input.require_curation && !curationRef) {
        stages.curation = { status: "curation_required", plan: planRef }
        return persist("curation_required", {
          next_inputs: [
            {
              stage: "curation",
              module: "curation",
              operation: "prepare",
              plans: [planRef],
              required: ["briefing_date", "reviewed_scores", "curation_path", "curation_sha256"],
            },
          ],
        })
      }
      if (curationRef) {
        const curated = loadCurationSelection(ctx, curationRef)
        stages.curation = {
          status: "selected",
          reference: curationRef,
          selected: curated.selected.length,
        }
        if (curated.batches.some((batch) => !same(batch.plan, planRef))) {
          return persist("curation_ready", {
            next_inputs: [
              {
                stage: "curation",
                module: "curation",
                operation: "advance",
                selection_path: curationRef.path,
                selection_sha256: curationRef.sha256,
                required: ["run_id", "execute"],
              },
            ],
          })
        }
      }
      phase = "events"
      const eventOptions = readJSON(ctx.root, base + "event-options.json")
      const currentOptions = {
        note_review_runs: p.note_review_runs ?? eventOptions?.note_review_runs ?? [],
        connection_review_run:
          p.connection_review_run ?? eventOptions?.connection_review_run ?? null,
      }
      if (eventOptions && !same(eventOptions, currentOptions))
        throw Error("Round native impact inputs changed; use a new round")
      if (!eventOptions) atomicCreate(ctx.root, base + "event-options.json", currentOptions)
      const eventRun = curationRef
        ? "round-cur-" + sha256(JSON.stringify([p.run_id, planRef, curationRef])).slice(0, 48)
        : "round-" +
          p.run_id +
          (planRef ? "-events-" + planRef.sha256.slice(0, 16) : "-proposal-" + (p.offset || 0))
      let events,
        reused = false
      const readOnlyResume =
        !p.execute &&
        !p.retry_failed &&
        !(p.retry_groups || []).length &&
        ![
          p.fact_reviews,
          p.editorial_reviews,
          p.revision_reviews,
          p.completeness_reviews,
          p.coverage_reviews,
        ].some((map) => Object.keys(map || {}).length)
      if (
        old?.event_workflow &&
        old.stages?.events?.run_id === eventRun &&
        (old.stages.events.status === "complete" || readOnlyResume) &&
        same(old.plan || null, planRef)
      ) {
        events = checked(ctx.root, old.event_workflow)
        const approvals = new Map(
          (events.approved_runs || []).map((run) => [
            run,
            loadCurrentApproval(ctx.root, run, { vault: ctx.vault }),
          ]),
        )
        // Native publication loading checks source, selection, draft and approval
        // bytes again without running collection, extraction or article writing.
        if (old.publication_handoff) {
          const handoff = checked(ctx.root, old.publication_handoff)
          if (handoff.approved_runs.length)
            loadDailyPublicationSelection(ctx.root, old.publication_handoff.path, {
              vault: ctx.vault,
            })
          for (const row of [...handoff.approved_runs, ...(handoff.reused_runs || [])]) {
            const approval = approvals.get(row.approved_run)
            if (
              !approval ||
              !same(approval.files, row.files) ||
              approval.article.event_id !== row.event_id ||
              sha256(JSON.stringify(approval.article)) !== row.article_sha256
            )
              throw Error("Round publication approval binding changed")
          }
        }
        reused = true
      } else {
        persist("processing")
        events = await eventProcessor(
          ctx,
          {
            ...p,
            ...(input.require_completeness !== undefined
              ? { require_completeness: input.require_completeness }
              : {}),
            run_id: eventRun,
            edition_path: editionRef.path,
            edition_sha256: editionRef.sha256,
            note_review_runs: currentOptions.note_review_runs,
            ...(currentOptions.connection_review_run
              ? { connection_review_run: currentOptions.connection_review_run }
              : {}),
            ...(planRef ? { plan_path: planRef.path, plan_sha256: planRef.sha256 } : {}),
            ...(curationRef
              ? { curation_path: curationRef.path, curation_sha256: curationRef.sha256 }
              : {}),
            ...(input.ontology_base
              ? {
                  ontology_path: input.ontology_base.path,
                  ontology_sha256: input.ontology_base.sha256,
                }
              : {}),
            propose: p.propose ?? true,
            execute: Boolean(p.execute) && clock() - started < (p.time_budget_ms || 600000),
            time_budget_ms: Math.max(1, (p.time_budget_ms || 600000) - (clock() - started)),
          },
          { clock, baseProvider },
        )
      }
      eventRef = reference(ctx.root, `event-workflows/${eventRun}/latest.json`)
      checked(ctx.root, eventRef)
      stages.events = { status: events.status, run_id: eventRun, reference: eventRef, reused }
      persist("events_checkpointed")
      if (events.ontology) {
        phase = "knowledge"
        checked(ctx.root, events.ontology)
        const savedKnowledgeOptions = readJSON(ctx.root, base + "knowledge-options.json")
        const knowledgeOptions = {
          knowledge_selections_file:
            p.knowledge_selections_file ?? savedKnowledgeOptions?.knowledge_selections_file ?? null,
          trend_review_runs: p.trend_review_runs ?? savedKnowledgeOptions?.trend_review_runs ?? [],
          connection_review_run: currentOptions.connection_review_run,
        }
        const definitions = knowledgeOptions.knowledge_selections_file
          ? prepareKnowledgeReviewSelections(
              ctx.root,
              JSON.parse(
                fs.readFileSync(
                  safePath(ctx.repo, knowledgeOptions.knowledge_selections_file),
                  "utf8",
                ),
              ),
              { vault: ctx.vault },
            )
          : []
        const trends = prepareTrendReviewRuns(ctx.root, knowledgeOptions.trend_review_runs, {
          vault: ctx.vault,
        })
        const connections = knowledgeOptions.connection_review_run
          ? loadKnowledgeConnectionApproval(ctx.root, knowledgeOptions.connection_review_run, {
              vault: ctx.vault,
            })
          : null
        const knowledgeInput = {
          ontology: events.ontology,
          ...(knowledgeOptions.knowledge_selections_file
            ? {
                knowledge_selections: reference(
                  ctx.repo,
                  knowledgeOptions.knowledge_selections_file,
                ),
              }
            : {}),
          definitions,
          trend_reviews: trends,
          ...(connections
            ? {
                connection_review: {
                  run: knowledgeOptions.connection_review_run,
                  files: connections.files,
                },
              }
            : {}),
        }
        const fingerprint = sha256(JSON.stringify(knowledgeInput))
        if (stages.knowledge?.input_sha256 === fingerprint && knowledgeRef) {
          checked(ctx.root, knowledgeRef)
          stages.knowledge = { ...stages.knowledge, reused: true }
        } else {
          const knowledge = await knowledgeProcessor(ctx, {
            ontology: events.ontology,
            ...knowledgeOptions,
          })
          const knowledgePath = base + "knowledge-" + sha256(JSON.stringify(knowledge)) + ".json"
          if (!readJSON(ctx.root, knowledgePath)) atomicCreate(ctx.root, knowledgePath, knowledge)
          knowledgeRef = reference(ctx.root, knowledgePath)
          stages.knowledge = {
            status: "projected",
            reference: knowledgeRef,
            input_sha256: fingerprint,
            reused: false,
          }
          atomicWrite(ctx.root, base + "knowledge-options.json", knowledgeOptions)
        }
      } else stages.knowledge = { status: "approval_pending" }
      persist("publication_preparing")
      phase = "publication"
      const publication =
        reused && old.publication_handoff
          ? { publication_handoff: old.publication_handoff, status: old.stages.publication.status }
          : events.publication ||
            (await publicationProcessor(ctx, {
              run_id: "event-publication-" + sha256(eventRun).slice(0, 40),
              workflow_path: eventRef.path,
              workflow_sha256: eventRef.sha256,
            }))
      publicationRef = publication.publication_handoff || events.publication_handoff
      if (publicationRef) checked(ctx.root, publicationRef)
      stages.publication = {
        status: publication.status,
        ...(publicationRef ? { reference: publicationRef } : {}),
        reused,
      }
      return persist(events.status, {
        event_workflow: eventRef,
        ...(knowledgeRef ? { knowledge_index: knowledgeRef } : {}),
        ...(publicationRef ? { publication_handoff: publicationRef } : {}),
        next_inputs: nextInputs(events),
        model_calls: reused ? 0 : events.model_calls || 0,
        article_writes: reused ? 0 : events.article_writes || 0,
        approved_runs: events.approved_runs || [],
        collection_status: stages.collection.status,
      })
    } catch (error) {
      const waiting = error.code === "REASONING_PENDING"
      stages[phase] = {
        ...stages[phase],
        status: waiting ? "waiting_for_reasoning" : "failed",
        error: error.message,
        code: error.code || null,
        ...(error.reasoning_task ? { reasoning_task: error.reasoning_task } : {}),
      }
      persist(waiting ? "waiting_for_reasoning" : "partial", {
        next_inputs: [
          waiting
            ? {
                stage: "reasoning",
                reasoning_task: error.reasoning_task,
                required: ["reasoning_result", "resume"],
              }
            : { stage: phase, error: error.message, required: ["resume"] },
        ],
      })
      throw error
    }
  })
}
