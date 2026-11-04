import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { sha256 } from "./contracts.mjs"
import { verifyProcessingFixtureBindings } from "./processing-fixture.mjs"

const read = (file) => JSON.parse(fs.readFileSync(file))
const clone = (value) => structuredClone(value)
const key = (request) =>
  sha256(JSON.stringify({ messages: request.messages, schema: request.schema }))
const publicationDateAnchor = "Publication date comes only from dates.published_at, otherwise null."
const publicationDateAddition = " The publication date is the source document's publication date. Assign an event or announcement date only when its exact source evidence supports it."
const historicalWriterPromptSHA = "f74222b5517a2fc6b792253fcf24e934a05b8d557d199a9059077f5c3a73cbb6"
const currentWriterPromptSHA = "21b11ec67daa04fc8a0fb51ce38d172536e55d6619b72bd034cc7febca0e936a"

function historicalReplayBindingMatches(exchange, request, role, expectedRole) {
  if (role !== expectedRole || exchange.role !== role ||
      !Array.isArray(exchange.request?.messages) || exchange.request.messages.length !== 2 ||
      !Array.isArray(request.messages) || request.messages.length !== 2 ||
      exchange.request.messages[0]?.role !== "system" || request.messages[0]?.role !== "system" ||
      exchange.request.messages[1]?.role !== "user" || request.messages[1]?.role !== "user" ||
      JSON.stringify(exchange.request.messages[1]) !== JSON.stringify(request.messages[1]) ||
      JSON.stringify(exchange.request.schema) !== JSON.stringify(request.schema) ||
      typeof exchange.run !== "string" || !exchange.run ||
      typeof exchange.source?.path !== "string" || !exchange.source.path ||
      !/^[a-f0-9]{64}$/.test(exchange.source?.sha256 || "") ||
      typeof exchange.source?.attempt_id !== "string" || !exchange.source.attempt_id ||
      exchange.output === undefined ||
      typeof exchange.request.messages[0].content !== "string" ||
      typeof request.messages[0].content !== "string")
    return false
  return JSON.stringify({ ...exchange.request.messages[0], content: "" }) ===
    JSON.stringify({ ...request.messages[0], content: "" })
}

// Only historically observed prompt changes are mapped. They strengthened
// date attribution, so the replay receipt must never claim that the older
// response was generated or independently reviewed under the current prompt.
function historicalDatePromptMatch(exchange, request, role) {
  if (!historicalReplayBindingMatches(exchange, request, role, "fact_extract")) return false
  const original = exchange.request.messages[0].content
  if (original.split(publicationDateAnchor).length !== 2)
    return false
  const changed = original.replace(publicationDateAnchor, publicationDateAnchor + publicationDateAddition)
  return JSON.stringify({ ...exchange.request.messages[0], content: changed }) ===
    JSON.stringify(request.messages[0])
}

function historicalWriterPromptMatch(exchange, request, role) {
  return historicalReplayBindingMatches(exchange, request, role, "article_write") &&
    sha256(exchange.request.messages[0].content) === historicalWriterPromptSHA &&
    sha256(request.messages[0].content) === currentWriterPromptSHA
}

// These count successful replay-provider responses, not new model calls,
// attempted calls outside the provider, or verified application of a repair.
export function summarizeReplayObservations(telemetry, rows) {
  if (!Array.isArray(telemetry?.requests) || !Array.isArray(rows))
    throw Error("Replay requests and selected result rows required")
  const tasks = new Map(), roles = new Map()
  let unspecifiedTasks = 0, unspecifiedRoles = 0
  for (const request of telemetry.requests) {
    if (typeof request.task === "string" && request.task) tasks.set(request.task, (tasks.get(request.task) || 0) + 1)
    else unspecifiedTasks++
    if (typeof request.role === "string" && request.role) roles.set(request.role, (roles.get(request.role) || 0) + 1)
    else unspecifiedRoles++
  }
  return {
    schema: "research-replay-observed-counts/v1",
    successful_replayed_requests: telemetry.requests.length,
    requests_by_role: Object.fromEntries(roles),
    requests_without_role: unspecifiedRoles,
    requests_by_native_task: Object.fromEntries(tasks),
    requests_without_native_task: unspecifiedTasks,
    combined_review_repair_requests: tasks.get("combined_review_repair") || 0,
    correction_time_repair_requests: tasks.get("combined_review_correction_time_repair") || 0,
    writer_correction_requests: tasks.get("combined_review_correction") || 0,
    selected_approved_reuse: rows.every((row) => typeof row.action === "string" && typeof row.status === "string")
      ? rows.filter((row) => row.action === "reuse" && row.status === "reused").length : null,
    coverage_decisions_reused: null,
    applied_writer_corrections: null,
    failed_or_unobserved_requests: null,
    scope: "successful saved-response replay only; no live model calls, independent review, or verified repair application is implied",
  }
}

// This adapter is deliberately restricted to recorded-response experiments.
// It cannot be selected by the operational provider factory.
export function recordedProcessingProvider(instance, oracle, telemetry) {
  if (instance.live || !instance.imported_replay_oracle)
    throw Error("Replay oracle forbidden in live processing")
  const exchanges = new Map()
  for (const exchange of oracle.exchanges) {
    const fingerprint = key(exchange.request)
    exchanges.set(fingerprint, [...(exchanges.get(fingerprint) || []), exchange])
  }
  const articles = new Map(oracle.articles.map((a) => [a.writer_run, a]))
  return {
    metadata: async (model) => ({
      model,
      digest: sha256("recorded-processing-replay/v1"),
      runtime: "recorded-replay/v1",
      capabilities: ["completion"],
      thinking: { values: [false, true, "medium", "high"] },
    }),
    async structured(request) {
      const began = performance.now(),
        input = JSON.parse(request.messages[1].content)
      let output,
        transformation = null,
        replayEvidence = null
      if (input.task === "combined_review") {
        const a = articles.get(input.run_id)
        if (!a) throw Error("No historical article for combined replay")
        const assigned = new Set(input.assigned_claim_ids)
        output = {
          schema:
            input.kind === "evidence"
              ? "research-evidence-review-bundle/v1"
              : "research-editorial-review-bundle/v1",
          input_sha256: input.input_sha256,
          read_manifest_sha256: input.source_manifest.sha256,
          part: input.part,
          reviewer: a.fact_review.reviewer,
          reviewed_at: a.fact_review.reviewed_at,
          source_read: true,
          all_relevant_facts_checked: true,
        }
        if (input.kind === "evidence") {
          const decisions = a.fact_review.claims.filter((c) => assigned.has(c.claim_id))
          const additions = input.part === 0 ? a.fact_review.additions || [] : []
          const refs = new Map(
            a.reviewed_claims.map((c, i) => [
              c.claim_id,
              i < a.original_claims.length
                ? a.original_claims[i].claim_id
                : "addition:" + (i - a.original_claims.length),
            ]),
          )
          output.importance_reviewed_at = a.completeness_review.reviewed_at
          output.fact_review = { claims: clone(decisions), additions: clone(additions) }
          output.important_facts = a.completeness_review.fact_decisions.flatMap((d) => {
            const claim_ref = refs.get(d.claim_id)
            if (
              !assigned.has(claim_ref) &&
              !(input.part === 0 && claim_ref?.startsWith("addition:"))
            )
              return []
            const { claim_id, ...decision } = d
            return [{ claim_ref, ...clone(decision) }]
          })
        } else {
          const draft = read(path.join(instance.root, `runs/${input.run_id}/draft.json`))
          const correction = a.corrections.find((c) => c.draft_id === draft.draft_id)
          const editorial =
            draft.draft_id === a.final_draft.draft_id
              ? a.editorial_review
              : correction
                ? {
                    status: "needs_revision",
                    draft_id: draft.draft_id,
                    reviewer: correction.reviewer,
                    reviewed_at: correction.reviewed_at,
                    reason: correction.reason,
                  }
                : a.editorial_attempts.find((r) => r.value.draft_id === draft.draft_id)?.value
          if (!editorial) throw Error("No explicit recorded review or correction finding for draft")
          if (editorial.draft_id !== draft.draft_id)
            throw Error("No exact recorded editorial decision for draft")
          output.reviewer = editorial.reviewer
          output.reviewed_at = editorial.reviewed_at
          output.editorial_review = input.part === 0 ? clone(editorial) : null
          if (output.editorial_review) delete output.editorial_review.completeness_review
          const coverage =
            draft.draft_id === a.final_draft.draft_id
              ? a.coverage_review
              : a.coverage_attempts.find((r) => r.value.draft_id === draft.draft_id)?.value ||
                a.coverage_review
          output.coverage_reviewed_at = coverage.reviewed_at
          output.coverage =
            editorial.status === "approved"
              ? clone(coverage.coverage.filter((c) => assigned.has(c.claim_id)))
              : []
          if (
            output.coverage.some(
              (row) =>
                row.meaning_checked !== true ||
                !Array.isArray(row.preserved_aspects) ||
                !row.preserved_aspects.includes("fact") ||
                !Array.isArray(row.locations) ||
                !row.locations.length ||
                typeof row.reason !== "string" ||
                !row.reason.trim(),
            )
          )
            throw Error("An explicit historical coverage judgment is required for replay mapping")
          output.coverage_decisions = output.coverage.map((row) => ({
            claim_id: row.claim_id,
            decision: "preserved",
            reason: null,
          }))
        }
        transformation =
          "explicit historical native decisions mapped to combined schema; not a model execution"
      } else if (input.task === "combined_review_correction") {
        const a = articles.get(input.run_id)
        const draft = read(path.join(instance.root, `runs/${input.run_id}/draft.json`))
        const correction = a?.corrections.find((c) => c.draft_id === draft.draft_id)
        if (!correction) throw Error("No exact recorded correction")
        output = clone(correction)
        delete output.draft_id
        transformation = "historical native writer correction response"
      } else {
        const role = this.executionPolicy?.role
        const exact = (exchanges.get(key(request)) || []).filter((entry) => entry.role === role)
        const transformed = exact.length ? [] : oracle.exchanges.filter((entry) =>
          historicalDatePromptMatch(entry, request, role) || historicalWriterPromptMatch(entry, request, role),
        )
        if (exact.length > 1 || transformed.length > 1)
          throw Error("Ambiguous recorded model request; replay requires one exact historical response")
        const found = exact[0] || transformed[0]
        if (!found) {
          const diagnostic = path.join(instance.repo, ".local/unmatched-replay-request.json")
          fs.writeFileSync(
            diagnostic,
            JSON.stringify({ role: this.executionPolicy?.role, request }, null, 2),
          )
          throw Error("No exact recorded model request; diagnostic: " + diagnostic)
        }
        output = clone(found.output)
        if (transformed.length) {
          transformation = role === "article_write"
            ? "historical writer replay: publication date is now distinguished from announcement and event dates; the saved response was not generated or verified under the current prompt"
            : "historical fact extraction replay: publication date and event date prompt guidance was added; the saved response was not generated or verified under the current prompt"
          replayEvidence = {
            original_request_sha256: key(found.request),
            original_output_sha256: sha256(JSON.stringify(found.output)),
            original_source: clone(found.source),
            original_system_prompt_sha256: sha256(found.request.messages[0].content),
            current_system_prompt_sha256: sha256(request.messages[0].content),
            current_prompt_validated: false,
          }
        }
      }
      telemetry.requests.push({
        role: this.executionPolicy?.role || null,
        task: typeof input.task === "string" && input.task ? input.task : null,
        request_sha256: key(request),
        output_sha256: sha256(JSON.stringify(output)),
        transformation,
        model_execution: false,
        ...(replayEvidence || {}),
      })
      telemetry.provider_ms += performance.now() - began
      return {
        output,
        artifacts: {
          request: { ...request, format: request.schema },
          request_sha256: key(request),
          response_content: JSON.stringify(output),
          response_content_sha256: sha256(JSON.stringify(output)),
          done: true,
          done_reason: "recorded_replay",
        },
        provenance: { runtime: "recorded-replay/v1", actual_model_execution: false,
          ...(replayEvidence ? { replay_transformation: { reason: transformation, ...replayEvidence } } : {}) },
      }
    },
  }
}

export async function runRecordedProcessingCase({
  code_repo,
  instance,
  review_repair_mode,
  mode,
  retry_candidates = [],
}) {
  if (!["separate/v1", "combined/v1"].includes(mode) || instance.live)
    throw Error("Explicit replay mode required")
  if (review_repair_mode !== undefined &&
      (review_repair_mode !== "components/v1" || mode !== "combined/v1"))
    throw Error("Bound combined review repair mode required")
  const load = (name) =>
    import(pathToFileURL(path.join(code_repo, "scripts/research/" + name)).href)
  const [{ moduleContext }, { advanceCuration }, { nativeResearch }] = await Promise.all([
    load("module-runtime.mjs"),
    load("curation-workflow.mjs"),
    load("modules/contracts.mjs"),
  ])
  const ctx = moduleContext({ ...instance, executionRepo: code_repo })
  const oracle = read(path.join(instance.repo, ".local/replay-oracle.json"))
  const byCandidate = new Map(oracle.articles.map((a) => [a.candidate_id, a]))
  const telemetry = {
    requests: [],
    provider_ms: 0,
    passes: [],
    started_at: new Date().toISOString(),
  }
  const provider = recordedProcessingProvider(instance, oracle, telemetry)
  const parameters = {
    run_id: "processing-replay",
    selection_path: instance.selection.path,
    selection_sha256: instance.selection.sha256,
    execute: true,
    require_completeness: true,
    max_items: 40,
    max_model_calls: 64,
    time_budget_ms: 3600000,
    ...(retry_candidates.length ? { retry_candidates } : {}),
    ...(mode === "combined/v1" ? { review_mode: mode } : {}),
    ...(review_repair_mode ? { review_repair_mode } : {}),
    fact_reviews: {},
    completeness_reviews: {},
    editorial_reviews: {},
    coverage_reviews: {},
  }
  const writeReview = (a, kind, value) => {
    const file = `.local/replay-decisions/${a.writer_run}/${kind}-${sha256(JSON.stringify(value))}.json`
    fs.mkdirSync(path.dirname(path.join(instance.repo, file)), { recursive: true })
    fs.writeFileSync(path.join(instance.repo, file), JSON.stringify(value, null, 2) + "\n")
    return file
  }
  const started = performance.now()
  let result
  for (let pass = 0; pass < 12; pass++) {
    result = await advanceCuration(ctx, parameters, { baseProvider: provider })
    const failures = [...(result.failures || []), ...(result.errors || [])]
    telemetry.passes.push({
      pass,
      status: result.status,
      approved: result.approved_runs?.length || 0,
      rows: result.rows.map((r) => ({ candidate_id: r.candidate_id, status: r.status })),
      validation_statistics: result.validation_statistics || null,
    })
    fs.writeFileSync(
      path.join(instance.repo, ".local/replay-progress.json"),
      JSON.stringify(telemetry, null, 2),
    )
    if (failures.length) throw Error("Native replay failed: " + JSON.stringify(failures))
    if (result.status === "complete") break
    if (mode === "separate/v1")
      for (const row of result.rows) {
        const a = byCandidate.get(row.candidate_id)
        if (!a || ["approved", "reused", "queued"].includes(row.status)) continue
        if (row.status === "fact_review")
          parameters.fact_reviews[a.candidate_id] = writeReview(a, "fact", a.fact_review)
        else if (row.status === "completeness_review")
          parameters.completeness_reviews[a.candidate_id] = writeReview(
            a,
            "completeness",
            a.completeness_review,
          )
        else if (["editorial_review", "coverage_review"].includes(row.status)) {
          let draft = read(path.join(instance.root, `runs/${a.writer_run}/draft.json`))
          for (
            let corrections = 0;
            draft.draft_id !== a.final_draft.draft_id && corrections < 5;
            corrections++
          ) {
            const correction = a.corrections.find((c) => c.draft_id === draft.draft_id)
            if (!correction) throw Error("Missing original writer correction")
            await nativeResearch(
              ctx,
              "correct",
              { run_id: a.writer_run, review_file: writeReview(a, "correction", correction) },
              { run_id: "run", review_file: "review" },
            )
            draft = read(path.join(instance.root, `runs/${a.writer_run}/draft.json`))
          }
          const editorial = clone(a.editorial_review)
          delete editorial.completeness_review
          parameters.editorial_reviews[a.candidate_id] = writeReview(a, "editorial", editorial)
          parameters.coverage_reviews[a.candidate_id] = writeReview(
            a,
            "coverage",
            a.coverage_review,
          )
        }
      }
  }
  const wall_ms = performance.now() - started
  if (
    result.status !== "complete" ||
    result.rows.length !== 32 ||
    result.rows.some((r) => !["approved", "reused"].includes(r.status))
  )
    throw Error("All 32 native approvals and publication handoff required")
  const writerVerification = verifyProcessingFixtureBindings(instance)
  const artifacts = result.rows.map((row) => {
    const writer = row.writer_run || row.approved_run
    return {
      candidate_id: row.candidate_id,
      writer_run: writer,
      action: row.action,
      claims: read(path.join(instance.root, `runs/${writer}/reviewed-claims.json`)).claims,
      documents: read(path.join(instance.root, `runs/${writer}/documents.json`)),
      parses: read(path.join(instance.root, `runs/${writer}/parses.json`)),
      draft: read(path.join(instance.root, `runs/${writer}/draft.json`)),
      editorial: read(path.join(instance.root, `runs/${writer}/editorial-review.json`)),
      approval: read(path.join(instance.root, `runs/${writer}/approved-article.json`)),
    }
  })
  const receipt = {
    schema: "research-article-processing-replay-case/v1",
    mode,
    code_repo,
    instance,
    started_at: telemetry.started_at,
    completed_at: new Date().toISOString(),
    wall_ms,
    control_validation_ms: wall_ms - telemetry.provider_ms,
    replay_provider_ms: telemetry.provider_ms,
    model_calls: 0,
    external_calls: 0,
    selected: 32,
    fresh: 31,
    prior_reuse: 1,
    private_native_approvals: 31,
    production_approvals: 0,
    writer_binding_verification: writerVerification,
    observed_counts: summarizeReplayObservations(telemetry, result.rows),
    telemetry,
    publication_handoff: result.publication_handoff,
    artifacts,
  }
  const receiptFile = path.join(instance.repo, ".local/replay-receipt.json")
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n")
  return {
    path: receiptFile,
    sha256: sha256(fs.readFileSync(receiptFile)),
    wall_ms,
    control_validation_ms: receipt.control_validation_ms,
    requests: telemetry.requests.length,
    observed_counts: receipt.observed_counts,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = read(process.argv[2])
  console.log(JSON.stringify(await runRecordedProcessingCase(config)))
}
