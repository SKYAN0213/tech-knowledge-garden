import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { extractClaims, planExtractionBatches, validateEvidence } from "./claims.mjs"
import { prepareRoleProvider, resolveRolePolicy } from "./model-policy.mjs"
import { createModelProvider, createModelExecutionWindow } from "./model-provider.mjs"
import { modelSourceDates } from "./source-context.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { loadStoredSourceRun, selectStoredSources, articleContentFingerprint } from "./parser.mjs"
import { samePublicationDate } from "./dates.mjs"
import { saveSourceSelection } from "./source-selection.mjs"
import { createCollectionMaterialReader } from "./collection-report.mjs"
import { checkedEdition, checkedPlan, loadSelectedEvent } from "./event-pipeline.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock, RunState } from "./run-state.mjs"

const codeHash = () =>
  Object.fromEntries(
    [
      "event-inference.mjs",
      "claims.mjs",
      "model-policy.mjs",
      "model-provider.mjs",
      "ollama.mjs",
      "contracts.mjs",
    ].map((name) => [name, sha256(fs.readFileSync(new URL(name, import.meta.url)))]),
  )
const policyFor = (ctx) => JSON.parse(fs.readFileSync(ctx.policy, "utf8"))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const attemptCount = (ctx, run, role) =>
  readJSON(ctx.root, `runs/${run}/model-policy/${role}/budget.json`)?.attempts.length || 0
function save(root, file, value) {
  const prior = readJSON(root, file)
  if (prior) {
    if (!same(prior, value)) throw Error("Event inference input changed; use a new run")
    return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
  }
  return atomicCreate(root, file, value)
}
async function provider(ctx, policy, role, run, injected, execution = {}) {
  const settings = resolveRolePolicy(policy, role)
  const base = injected || createModelProvider(policy, role, { root: ctx.root, run })
  return {
    model: await prepareRoleProvider(base, policy, role, { root: ctx.root, run, ...execution }),
    settings,
  }
}

function executionOptions(options) {
  if (options.retry_failed !== undefined && typeof options.retry_failed !== "boolean")
    throw Error("Failed source resume must be explicitly boolean")
  return {
    retryFailed: options.retry_failed ?? false,
    executionWindow: options.executionWindow ?? createModelExecutionWindow(options),
  }
}

const string = { type: "string", minLength: 1, maxLength: 500 }
const nullable = { type: ["string", "null"], maxLength: 500 }
function proposalSchema(keys) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["events"],
    properties: {
      events: {
        type: "array",
        maxItems: 16,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "who",
            "action",
            "object",
            "occurred_at",
            "effective_at",
            "external_id",
            "block_keys",
            "quantities",
          ],
          properties: {
            who: string,
            action: string,
            object: string,
            occurred_at: nullable,
            effective_at: nullable,
            external_id: nullable,
            block_keys: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { type: "string", enum: keys },
            },
            quantities: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["literal", "condition", "block_key"],
                properties: {
                  literal: string,
                  condition: { type: "string", maxLength: 1000 },
                  block_key: { type: "string", enum: keys },
                },
              },
            },
          },
        },
      },
    },
  }
}

// Minimal event proposals never acquire fact/editorial authority. Read all original
// blocks in bounded batches; cache independently of edition and writer names.
export async function extractEditionEventProposals(ctx, p, options = {}) {
  const { baseProvider } = options
  const execution = executionOptions(options)
  const editionRef = { path: p.edition_path, sha256: p.edition_sha256 }
  const { edition, report } = checkedEdition(ctx, editionRef)
  const eligible = report.materials.filter(
    (m) => m.roles.includes("article_candidate") && m.parse_status === "extracted",
  )
  const requested = p.material_ids || eligible.map((m) => m.id)
  if (
    new Set(requested).size !== requested.length ||
    requested.some((id) => !eligible.some((m) => m.id === id))
  )
    throw Error("Only extracted article materials in the frozen edition can be proposed")
  const offset = p.offset || 0,
    limit = p.max_items || 20
  const materialIds = requested.slice(offset, offset + limit)
  if (!materialIds.length) throw Error("Event proposal page is empty")
  const policy = policyFor(ctx),
    settings = resolveRolePolicy(policy, "search_plan")
  const input = {
    schema: "research-event-proposal-input/v1",
    run_id: p.run_id,
    edition: editionRef,
    material_ids: materialIds,
    policy_sha256: sha256(JSON.stringify(policy)),
    dependencies: codeHash(),
  }
  const read = createCollectionMaterialReader({
    root: ctx.root,
    reportPath: edition.report.path,
    reportSha256: edition.report.sha256,
  })
  return withLock(ctx.root, "event-proposals-" + p.run_id, async () => {
    save(ctx.root, `event-proposals/${p.run_id}/input.json`, input)
    const progressPath = `event-proposals/${p.run_id}/progress.json`
    const previousProgress = readJSON(ctx.root, progressPath)
    if (previousProgress) {
      const { checksum_sha256, ...body } = previousProgress
      if (
        checksum_sha256 !== sha256(JSON.stringify(body)) ||
        body.input_sha256 !== sha256(JSON.stringify(input))
      )
        throw Error("Event proposal progress binding changed")
    }
    const proposals = [],
      cache = [],
      failures = []
    for (const materialId of materialIds) {
      const source = read(materialId),
        parse = readJSON(ctx.root, `parses/${source.material.parse_id}/parse.json`)
      if (!parse || !same(parse.blocks, source.blocks))
        throw Error("Proposal parse identity changed")
      const binding = {
        stage: "minimal_events/v1",
        parse_id: parse.parse_id,
        source_version_id: parse.source_version_id,
        source_body_sha256: source.material.body_sha256,
        parse_sha256: sha256(JSON.stringify(parse)),
        settings,
        dependencies: input.dependencies,
      }
      const cacheRun = "ev-prop-" + sha256(JSON.stringify(binding)).slice(0, 40)
      const before = attemptCount(ctx, cacheRun, "search_plan")
      try {
        await withLock(ctx.root, "event-cache-" + cacheRun, async () => {
          const cached = readJSON(ctx.root, `runs/${cacheRun}/event-proposals.json`)
          if (cached) {
            if (
              !same(cached.binding, binding) ||
              cached.result_sha256 !== sha256(JSON.stringify(cached.result))
            )
              throw Error("Event proposal cache changed")
            proposals.push(
              ...cached.result.map((event) => ({
                ...event,
                material_id: materialId,
                review_status: "unreviewed",
              })),
            )
            cache.push({ material_id: materialId, run: cacheRun, reused: true, model_calls: 0 })
            return
          }
          const run = new RunState(ctx.root, cacheRun, binding)
          const { model } = await provider(
            ctx,
            policy,
            "search_plan",
            cacheRun,
            baseProvider,
            execution,
          )
          const contentBlocks = parse.blocks.filter(
            (b) => !/^(?:About\s+(?:[A-Z]|the\s+)|Über\s+|회사\s*소개|기업\s*소개)/u.test(b.text),
          )
          if (!contentBlocks.length)
            throw Error("No event-reading blocks outside corporate boilerplate")
          const plan = planExtractionBatches([parse], {
            num_ctx: settings.num_ctx,
            num_predict: settings.num_predict,
            input_char_budget: Math.min(20000, settings.num_ctx * 2),
            facts_per_batch: 6,
            max_blocks_per_batch: 8,
            block_scope: [
              { parse_id: parse.parse_id, block_ids: contentBlocks.map((b) => b.block_id) },
            ],
            request_factory: (context) => ({
              model: settings.model,
              think: settings.think,
              num_ctx: settings.num_ctx,
              num_predict: settings.num_predict,
              schema: proposalSchema(context.flatMap((d) => d.blocks.map((b) => b.block_key))),
              messages: [
                {
                  role: "system",
                  content:
                    "Extract minimal event candidates from the ORIGINAL source blocks. Return who, concrete action, object, announcement/event date, effective date, exact contract/product/paper identifier when explicit, quantities with exact conditions, and source block keys. Separate distinct actions in an IR report. Keep plans, execution and company claims distinct. Ignore navigation, corporate boilerplate and speculation. Do not write articles, explanations or market predictions. Null for absent dates/identifiers. These are UNREVIEWED proposals, never verified facts. Return [] when no event occurs in this batch.",
                },
                { role: "user", content: JSON.stringify(context) },
              ],
            }),
          })
          save(ctx.root, `runs/${cacheRun}/event-proposal-plan.json`, {
            scope: plan.scope,
            batches: plan.batches.map(({ request, ...batch }) => ({
              ...batch,
              request_sha256: sha256(JSON.stringify(request)),
            })),
          })
          const events = [],
            seen = new Set()
          for (const batch of plan.batches) {
            const context = JSON.parse(batch.request.messages[1].content)
            const request = batch.request,
              schema = request.schema
            const result = await run.stage("events-" + batch.batch_id, request, () =>
              model.structured(request),
            )
            assertSchema(result.output, schema)
            for (const event of result.output.events) {
              const refs = event.block_keys.map((key) => {
                const ref = plan.blocks.get(key),
                  block = parse.blocks.find((b) => b.block_id === ref.block_id)
                return { ...ref, quote: block.text }
              })
              const quantityProblems = []
              for (const quantity of event.quantities) {
                const block = context
                  .flatMap((d) => d.blocks)
                  .find((b) => b.block_key === quantity.block_key)
                if (
                  !event.block_keys.includes(quantity.block_key) ||
                  !block?.text.includes(quantity.literal) ||
                  (quantity.condition && !block.text.includes(quantity.condition))
                )
                  quantityProblems.push({
                    quantity,
                    problem: "quantity_or_condition_not_in_event_block",
                    original_text: block?.text ?? null,
                  })
              }
              const { block_keys, ...fields } = event
              const row = {
                proposal_id:
                  "proposal-" + sha256(JSON.stringify([parse.parse_id, fields, refs])).slice(0, 24),
                ...fields,
                evidence: refs,
                quantity_problems: quantityProblems,
                published_at: modelSourceDates(parse.dates).published_at ?? null,
              }
              if (!seen.has(row.proposal_id)) {
                events.push(row)
                seen.add(row.proposal_id)
              }
            }
          }
          const result = {
            binding,
            result: events,
            result_sha256: sha256(JSON.stringify(events)),
            requires_relationship_review: true,
          }
          save(ctx.root, `runs/${cacheRun}/event-proposals.json`, result)
          proposals.push(
            ...events.map((event) => ({
              ...event,
              material_id: materialId,
              review_status: "unreviewed",
            })),
          )
          cache.push({
            material_id: materialId,
            run: cacheRun,
            reused: false,
            model_calls: attemptCount(ctx, cacheRun, "search_plan") - before,
          })
        })
      } catch (error) {
        if (
          error.code === "REASONING_PENDING" ||
          (!error.model_budget && !["TimeoutError", "AbortError"].includes(error.name))
        )
          throw error
        const statePath = `runs/${cacheRun}/state.json`,
          state = readJSON(ctx.root, statePath)
        const planPath = `runs/${cacheRun}/event-proposal-plan.json`,
          batchPlan = readJSON(ctx.root, planPath)
        failures.push({
          material_id: materialId,
          source_version_id: parse.source_version_id,
          parse_id: parse.parse_id,
          source_body_sha256: source.material.body_sha256,
          parse_sha256: binding.parse_sha256,
          run: cacheRun,
          error: error.message,
          code: error.code ?? "MODEL_CALL_TIMEOUT",
          model_calls: attemptCount(ctx, cacheRun, "search_plan") - before,
          ...(error.model_budget ? { model_budget: error.model_budget } : {}),
          extraction_checkpoint: {
            state_path: statePath,
            ...(batchPlan
              ? {
                  plan_path: planPath,
                  plan_sha256: sha256(fs.readFileSync(safePath(ctx.root, planPath))),
                  pending_batches: batchPlan.batches.filter(
                    (b) => state?.stages["events-" + b.batch_id]?.status !== "complete",
                  ),
                }
              : {}),
            ...(state
              ? {
                  state_sha256: sha256(fs.readFileSync(safePath(ctx.root, statePath))),
                  completed_batch_ids: Object.entries(state.stages)
                    .filter(([, s]) => s.status === "complete")
                    .map(([id]) => id),
                  pending_batch_ids: Object.entries(state.stages)
                    .filter(([, s]) => s.status !== "complete")
                    .map(([id]) => id),
                }
              : {}),
          },
          requires_explicit_resume: true,
        })
      }
      const progress = {
        schema: "research-event-proposal-progress/v1",
        input_sha256: sha256(JSON.stringify(input)),
        processed_material_ids: cache.map((c) => c.material_id),
        failures,
        remaining_material_ids: materialIds.filter(
          (id) => !cache.some((c) => c.material_id === id),
        ),
        writer_allowed: false,
      }
      const bytes = JSON.stringify(progress),
        attemptPath = `event-proposals/${p.run_id}/attempts/${sha256(bytes)}.json`
      save(ctx.root, attemptPath, progress)
      atomicWrite(ctx.root, progressPath, { ...progress, checksum_sha256: sha256(bytes) })
    }
    const output = {
      schema: "research-edition-event-proposals/v2",
      edition: editionRef,
      status: failures.length ? "partial" : "relationship_review",
      writer_allowed: false,
      proposals,
      cache,
      processed_material_ids: cache.map((c) => c.material_id),
      remaining_material_ids: [
        ...failures.map((f) => f.material_id),
        ...requested.slice(offset + materialIds.length),
      ],
      failures,
      ...(failures.length ? { progress_path: progressPath, requires_explicit_resume: true } : {}),
      next_offset:
        offset + materialIds.length < requested.length ? offset + materialIds.length : null,
      model_calls: [...cache, ...failures].reduce((n, c) => n + c.model_calls, 0),
      candidate_published: false,
    }
    // A resumed call can report cache hits while the original persisted result remains immutable.
    const prior = readJSON(ctx.root, `event-proposals/${p.run_id}/result.json`)
    if (prior && !same(prior.proposals, output.proposals))
      throw Error("Stored proposal output changed")
    if (!prior && !failures.length)
      save(ctx.root, `event-proposals/${p.run_id}/result.json`, output)
    return output
  })
}

export async function extractSelectedEventEvidence(ctx, p, options = {}) {
  const { baseProvider } = options
  const execution = executionOptions(options)
  const selection = loadSelectedEvent(ctx, p)
  const plan = checkedPlan(ctx, selection.plan, selection.group_id)
  const bundle = loadStoredSourceRun(ctx.root, selection.source_run)
  const policy = policyFor(ctx),
    settings = resolveRolePolicy(policy, "fact_extract")
  const priorApproval =
    selection.existing_event && ["update", "correction"].includes(selection.action)
      ? loadCurrentApproval(ctx.root, selection.existing_event.run_id, { vault: ctx.vault })
      : null
  const priorDraft =
    priorApproval && readJSON(ctx.root, `runs/${priorApproval.run}/draft.json`).draft
  const priorUsedIds = priorDraft
    ? new Set(
        [
          ...priorDraft.lead,
          ...priorDraft.explanations.flatMap((e) => e.paragraphs),
          ...(priorDraft.analysis ? [priorDraft.analysis] : []),
        ].flatMap((s) => s.claim_ids),
      )
    : new Set()
  const priorClaims = priorApproval
    ? readJSON(ctx.root, `runs/${priorApproval.run}/reviewed-claims.json`).claims.filter((c) =>
        priorUsedIds.has(c.claim_id),
      )
    : []
  const priorParses = priorApproval
    ? readJSON(ctx.root, `runs/${priorApproval.run}/parses.json`)
    : []
  const rebasedPriorClaims = priorClaims.flatMap((claim) => {
    const evidence = []
    for (const e of claim.evidence) {
      const old = priorParses.find((p) => p.parse_id === e.parse_id)
      const current = bundle.parses.find(
        (p) =>
          p.source_id === e.source_id &&
          articleContentFingerprint(p) === articleContentFingerprint(old) &&
          samePublicationDate(p.dates?.published_at, old.dates?.published_at),
      )
      const blocks = current?.blocks.filter((b) => b.text.includes(e.quote)) || []
      if (blocks.length !== 1) return []
      evidence.push({
        ...e,
        source_id: current.source_id,
        source_version_id: current.source_version_id,
        parse_id: current.parse_id,
        block_id: blocks[0].block_id,
      })
    }
    return [{ ...claim, evidence }]
  })
  const candidateKey =
    p.candidate_key || `source-${selection.sources.find((s) => s.role === "primary").source_id}`
  if (!bundle.documents.some((d) => candidateKey === `source-${d.source_id}`))
    throw Error("Event candidate must belong to its selected original sources")
  return withLock(ctx.root, "run-" + p.run_id, async () => {
    const input = {
      schema: "research-selected-event-extraction-input/v1",
      selection_sha256: p.selection_sha256,
      source_identity: bundle.identity,
      candidate_key: candidateKey,
      settings,
      dependencies: codeHash(),
    }
    save(ctx.root, `runs/${p.run_id}/event-extraction-input.json`, input)
    save(ctx.root, `runs/${p.run_id}/documents.json`, bundle.documents)
    save(ctx.root, `runs/${p.run_id}/parses.json`, bundle.parses)
    const claims = [],
      origins = []
    for (const selected of selection.sources) {
      const parse = bundle.parses.find((p) => p.parse_id === selected.parse_id)
      const union = new Set(
        plan.events
          .filter((e) => ["write", "update", "correction"].includes(e.action))
          .flatMap((e) =>
            e.sources.filter((s) => s.parse_id === parse.parse_id).flatMap((s) => s.block_ids),
          ),
      )
      const blockIds = parse.blocks.filter((b) => union.has(b.block_id)).map((b) => b.block_id)
      const binding = {
        stage: "selected_source_facts/v1",
        source_version_id: parse.source_version_id,
        source_body_sha256: bundle.documents.find(
          (d) => d.source_version_id === parse.source_version_id,
        ).body_sha256,
        parse_sha256: sha256(JSON.stringify(parse)),
        block_ids: blockIds,
        settings,
        dependencies: input.dependencies,
      }
      const cacheRun = "ev-facts-" + sha256(JSON.stringify(binding)).slice(0, 40)
      const cached = await withLock(ctx.root, "event-cache-" + cacheRun, async () => {
        const callsBefore = attemptCount(ctx, cacheRun, "fact_extract")
        try {
          const prior = readJSON(ctx.root, `runs/${cacheRun}/selected-source-facts.json`)
          if (prior) {
            loadStoredSourceRun(ctx.root, cacheRun)
            if (
              !same(prior.binding, binding) ||
              prior.result_sha256 !== sha256(JSON.stringify(prior.result))
            )
              throw Error("Selected source fact cache changed")
            return { ...prior, reused: true }
          }
          await saveSourceSelection(
            ctx.root,
            cacheRun,
            selectStoredSources(ctx.root, selected.source_run, [selected.url]),
          )
          const run = new RunState(ctx.root, cacheRun, binding)
          const reusableClaims = rebasedPriorClaims.filter(
            (c) =>
              c.review.status === "verified" &&
              c.evidence.every(
                (e) => e.parse_id === parse.parse_id && blockIds.includes(e.block_id),
              ) &&
              validateEvidence(c, [parse]).structural_pass,
          )
          const covered = new Set(reusableClaims.flatMap((c) => c.evidence.map((e) => e.block_id)))
          if (reusableClaims.length && blockIds.every((id) => covered.has(id))) {
            const record = {
              binding,
              result: {
                claims: reusableClaims,
                provenance: {
                  schema: "research-approved-source-facts-reuse/v1",
                  approval_run: priorApproval.run,
                  approval_files: priorApproval.files,
                  extraction_plan: { batches: [] },
                },
              },
            }
            record.result_sha256 = sha256(JSON.stringify(record.result))
            save(ctx.root, `runs/${cacheRun}/selected-source-facts.json`, record)
            return { ...record, reused: false }
          }
          const { model } = await provider(
            ctx,
            policy,
            "fact_extract",
            cacheRun,
            baseProvider,
            execution,
          )
          const before = attemptCount(ctx, cacheRun, "fact_extract")
          const result = await extractClaims(model, [parse], {
            ...settings,
            candidate_key: `source-${parse.source_id}`,
            block_scope: [{ parse_id: parse.parse_id, block_ids: blockIds }],
            max_blocks_per_batch: settings.max_blocks_per_batch ?? 4,
            checkpoint: (id, request, action) => run.stage("claims-batch-" + id, request, action),
          })
          const record = { binding, result, result_sha256: sha256(JSON.stringify(result)) }
          save(ctx.root, `runs/${cacheRun}/selected-source-facts.json`, record)
          return {
            ...record,
            reused: false,
            new_model_calls: attemptCount(ctx, cacheRun, "fact_extract") - before,
          }
        } catch (error) {
          error.extraction_checkpoint = {
            ...error.extraction_checkpoint,
            source_version_id: parse.source_version_id,
            parse_id: parse.parse_id,
            cache_run: cacheRun,
            state_path: `runs/${cacheRun}/state.json`,
            source_body_sha256: binding.source_body_sha256,
            parse_sha256: binding.parse_sha256,
            requires_explicit_resume: true,
          }
          const checkpoint = {
            ...error.extraction_checkpoint,
            code: error.code ?? "MODEL_ATTEMPT_FAILED",
            error: error.message,
            ...(error.model_budget ? { model_budget: error.model_budget } : {}),
          }
          error.extraction_checkpoint.receipt = save(
            ctx.root,
            `runs/${cacheRun}/extraction-checkpoints/${sha256(JSON.stringify(checkpoint))}.json`,
            checkpoint,
          )
          error.model_calls =
            origins.reduce((total, origin) => total + origin.model_calls, 0) +
            attemptCount(ctx, cacheRun, "fact_extract") -
            callsBefore
          throw error
        }
      })
      const allowed = new Set(selected.block_ids)
      // Cross-event facts spanning both scopes are retained in the source cache,
      // but never silently assigned to either selected article.
      const scoped = cached.result.claims.filter((c) =>
        c.evidence.every((e) => e.parse_id === selected.parse_id && allowed.has(e.block_id)),
      )
      for (const claim of scoped) {
        const mapped = {
          ...claim,
          candidate_key: candidateKey,
          event_id: null,
          subject_id: null,
          claim_id: sha256(JSON.stringify([candidateKey, claim.statement, claim.evidence])).slice(
            0,
            24,
          ),
          review: validateEvidence(claim, bundle.parses),
        }
        if (mapped.review.status !== "unreviewed")
          throw Error("Fact cache cannot inherit verification")
        if (!claims.some((c) => c.claim_id === mapped.claim_id)) claims.push(mapped)
      }
      origins.push({
        run: cacheRun,
        result_sha256: cached.result_sha256,
        parse_id: parse.parse_id,
        selected_block_ids: selected.block_ids,
        shared_block_ids: blockIds,
        reused: cached.reused,
        selected_claim_count: scoped.length,
        out_of_scope_claim_count: cached.result.claims.length - scoped.length,
        batch_count: cached.result.provenance.extraction_plan.batches.length,
        model_calls: cached.new_model_calls || 0,
      })
    }
    const output = {
      claims,
      provenance: {
        schema: "research-event-fact-extraction/v1",
        input,
        sources: origins.map(({ reused, model_calls, ...row }) => row),
      },
      requires_fact_review: true,
    }
    save(ctx.root, `runs/${p.run_id}/claims.json`, output)
    return {
      status: "fact_review",
      claims: claims.length,
      structural_pass: claims.filter((c) => c.review.structural_pass).length,
      sources: origins,
      model_calls: origins.reduce((n, r) => n + r.model_calls, 0),
      fact_review_required: true,
      candidate_published: false,
    }
  })
}
