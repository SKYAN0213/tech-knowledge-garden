import fs from "node:fs"
import path from "node:path"
import { parseNote, walk, canonicalURL } from "../garden.mjs"
import { SECTORS } from "../sectors.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { checkedPlan, editionMaterials, eventWorkKey } from "./event-pipeline.mjs"
import { assertReviewDate, parseResearchDate, seoulPublicationDay } from "./dates.mjs"
import { registry } from "./discovery.mjs"
import { queryMatchesLanguage, validateSearchQueries } from "./search.mjs"
import { readSourcePolicyState } from "./source-policy-state.mjs"
import { selectStoredSources } from "./parser.mjs"
import {
  schema,
  id,
  text,
  day,
  file,
  list,
  integer,
  validateArguments,
} from "./modules/contracts.mjs"

const digest = { type: "string", pattern: "^[a-f0-9]{64}$" }
const refSchema = schema({ path: file("root"), sha256: digest }, ["path", "sha256"])
const nullableRef = { ...refSchema, type: ["object", "null"] }
const nullableDay = { type: ["string", "null"], pattern: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}$" }
const quote = { type: "string", minLength: 8, maxLength: 4000 }
const stages = [
  "investment",
  "production",
  "product_availability",
  "customer_adoption",
  "workforce",
  "research_validation",
  "commercialization",
  "strategy_execution",
]
const roles = [
  "customer",
  "filing",
  "local_press",
  "conference",
  "research",
  "company",
  "supplier",
  "industry_body",
  "regulator",
]
const citationSchema = schema({ material_id: digest, block_id: text, quote, published_at: text }, [
  "material_id",
  "block_id",
  "quote",
  "published_at",
])
const eventSchema = schema({ plan: refSchema, group_id: id, evidence: list(citationSchema, 8) }, [
  "plan",
  "group_id",
  "evidence",
])
const targetSchema = schema(
  {
    channel_id: id,
    role: { type: "string", enum: roles },
    reason: text,
    search_terms: { type: "string", minLength: 2, maxLength: 150, pattern: "\\S" },
  },
  ["channel_id", "role", "reason", "search_terms"],
)
const activationSchema = schema(
  {
    question_id: digest,
    decision: { type: "string", enum: ["activate"] },
    previous_review: nullableRef,
    target_stage: { type: "string", enum: stages },
    criterion: text,
    basis_reason: text,
    baseline: eventSchema,
    baseline_state: { type: "string", enum: ["planned", "reported", "in_progress", "completed"] },
    next_check_at: nullableDay,
    sector: { type: "string", enum: SECTORS },
    source_targets: list(targetSchema, 16),
  },
  [
    "question_id",
    "decision",
    "previous_review",
    "target_stage",
    "criterion",
    "basis_reason",
    "baseline",
    "baseline_state",
    "next_check_at",
    "sector",
    "source_targets",
  ],
)
const observationSchema = schema(
  {
    question_id: digest,
    decision: { type: "string", enum: ["observe"] },
    previous_review: refSchema,
    observation_kind: {
      type: "string",
      enum: ["progress", "answer", "counter_evidence", "context"],
    },
    event: eventSchema,
    event_state: { type: "string", enum: ["planned", "reported", "in_progress", "completed"] },
    occurred_at: nullableDay,
    effective_at: nullableDay,
    comparison: schema(
      { baseline_quote: quote, followup_quote: quote, criterion_match: text, conclusion: text },
      ["baseline_quote", "followup_quote", "criterion_match", "conclusion"],
    ),
    next_check_at: nullableDay,
  },
  [
    "question_id",
    "decision",
    "previous_review",
    "observation_kind",
    "event",
    "event_state",
    "occurred_at",
    "effective_at",
    "comparison",
    "next_check_at",
  ],
)

export const inquiryReviewSchema = schema(
  {
    schema: { type: "string", enum: ["research-inquiry-review-input/v1"] },
    pool: refSchema,
    reviewer: text,
    reviewed_at: text,
    questions: list({ anyOf: [activationSchema, observationSchema] }, 40),
  },
  ["schema", "pool", "reviewer", "reviewed_at", "questions"],
)

export const inquiryInputSchema = schema(
  {
    run_id: id,
    mode: { type: "string", enum: ["prepare", "review", "plan", "status"] },
    note_paths: list(file("vault"), 250),
    pool_path: file("root"),
    pool_sha256: digest,
    review_file: file(),
    question_ids: list(digest, 40),
    observation_day: day,
    max_queries: integer(1, 8),
  },
  ["mode"],
)

const reference = (root, relative) => ({
  path: relative,
  sha256: sha256(fs.readFileSync(safePath(root, relative))),
})
const validNotePath = (value) =>
  typeof value === "string" &&
  /^(?:TrendTopics|Signals)\/[^\r\n]+\.md$/.test(value) &&
  !/[\\\x00-\x1f\x7f]/.test(value) &&
  value.split("/").every((segment) => segment && segment !== "." && segment !== "..")
function checkedJSON(root, ref) {
  validateArguments(ref, refSchema, { root })
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Inquiry input bytes changed")
  return JSON.parse(bytes)
}
function immutable(root, relative, value) {
  const bytes = JSON.stringify(value, null, 2) + "\n"
  const current = safePath(root, relative)
  if (fs.existsSync(current)) {
    if (!fs.readFileSync(current).equals(Buffer.from(bytes)))
      throw Error("Inquiry inputs changed; use a new run ID")
    return reference(root, relative)
  }
  return atomicCreate(root, relative, bytes)
}
function questionFromNote(notePath, noteSha, meta, field, observation) {
  const question = observation ? observation[field] : meta[field]
  if (typeof question !== "string" || !question.trim()) return null
  const source = {
    note_path: notePath,
    note_sha256: noteSha,
    field,
    topic_id: observation?.topic_id || meta.id || null,
    observation_id: observation?.id || null,
    event_id: observation?.event_id || null,
  }
  return {
    question_id: sha256(
      JSON.stringify([
        source.note_path,
        source.field,
        source.topic_id,
        source.observation_id,
        question.trim(),
      ]),
    ),
    question: question.trim(),
    source,
    status: "unreviewed",
    source_read: false,
    publication_approved: false,
  }
}
function currentQuestion(ctx, question) {
  if (!validNotePath(question.source?.note_path))
    throw Error("Inquiry questions must reference existing topic or signal notes")
  const filePath = safePath(ctx.vault, question.source.note_path)
  const bytes = fs.readFileSync(filePath)
  if (sha256(bytes) !== question.source.note_sha256)
    throw Error("Inquiry source note changed; prepare and review its current question")
  const { meta } = parseNote(bytes.toString("utf8"))
  const observation = question.source.observation_id
    ? (meta.observations || []).find((row) => row.id === question.source.observation_id)
    : undefined
  if (question.source.observation_id && !observation)
    throw Error("Inquiry observation no longer exists")
  const rebuilt = questionFromNote(
    question.source.note_path,
    sha256(bytes),
    meta,
    question.source.field,
    observation,
  )
  if (!rebuilt || JSON.stringify(rebuilt) !== JSON.stringify(question))
    throw Error("Inquiry question differs from its original note")
  return question
}

export function prepareInquiries(ctx, p) {
  const files =
    p.note_paths ||
    ["TrendTopics", "Signals"]
      .flatMap((directory) => walk(safePath(ctx.vault, directory)))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.relative(ctx.vault, name))
  if (new Set(files).size !== files.length) throw Error("Unique inquiry note paths required")
  const candidates = [],
    notes = []
  for (const notePath of [...files].sort()) {
    if (!validNotePath(notePath))
      throw Error("Inquiry prepare accepts only existing Signals and TrendTopics")
    const bytes = fs.readFileSync(safePath(ctx.vault, notePath)),
      noteSha = sha256(bytes),
      { meta } = parseNote(bytes.toString("utf8"))
    notes.push({ path: notePath, sha256: noteSha })
    if (meta.schema_version === "tech-trend/v1") {
      for (const field of ["watch_for", "disconfirming"])
        candidates.push(questionFromNote(notePath, noteSha, meta, field))
    } else if (meta.schema_version === "tech-signals/v1") {
      for (const observation of meta.observations || [])
        candidates.push(questionFromNote(notePath, noteSha, meta, "next_check", observation))
    }
  }
  const rows = candidates.filter(Boolean)
  if (rows.length > 2000 || new Set(rows.map((row) => row.question_id)).size !== rows.length)
    throw Error("Bounded unique inquiry candidates required")
  const pool = {
    schema: "research-inquiry-pool/v1",
    run_id: p.run_id,
    vault: ctx.vault,
    notes,
    candidates: rows,
    source_body_confirmed: false,
    publication_approved: false,
  }
  const ref = immutable(ctx.root, `inquiries/runs/${p.run_id}/pool.json`, pool)
  // This is a queue of references to original notes, not another topic database.
  atomicWrite(ctx.root, "inquiries/latest-pool.json", ref)
  return {
    ...ref,
    status: "questions_pending_review",
    candidate_count: rows.length,
    candidates: rows,
    network_requests: 0,
    publication_approved: false,
  }
}

export function loadInquiryPool(ctx, ref) {
  const pool = checkedJSON(ctx.root, ref)
  if (
    pool.schema !== "research-inquiry-pool/v1" ||
    ref.path !== `inquiries/runs/${pool.run_id}/pool.json` ||
    pool.vault !== ctx.vault
  )
    throw Error("Exact inquiry pool and original vault required")
  pool.candidates.forEach((question) => currentQuestion(ctx, question))
  return pool
}

function readEvent(ctx, input, reviewedAt) {
  const plan = checkedPlan(ctx, input.plan, input.group_id),
    event = plan.events.find((row) => row.group_id === input.group_id)
  const checked = input.evidence.map((proof) => {
    const source = event.sources.find((row) => row.material_id === proof.material_id)
    if (!source || !source.block_ids.includes(proof.block_id))
      throw Error("Inquiry evidence must belong to its exact reviewed event")
    const material = editionMaterials(ctx, {
      edition_path: plan.edition.path,
      edition_sha256: plan.edition.sha256,
      material_id: proof.material_id,
    })
    const block = material.blocks.find((row) => row.block_id === proof.block_id)
    if (
      !block ||
      !block.text.includes(proof.quote) ||
      material.material.published_at !== proof.published_at
    )
      throw Error("Inquiry evidence requires an exact original quote and publication date")
    assertReviewDate(reviewedAt, {
      notBefore: [
        proof.published_at,
        ...material.material.observations.map((row) => row.observed_at),
        plan.reviewed_at,
      ],
    })
    return {
      ...proof,
      source_version_id: source.source_version_id,
      parse_id: source.parse_id,
      url: source.url,
    }
  })
  return {
    plan: input.plan,
    group_id: input.group_id,
    identity: event.identity,
    event_work_key: eventWorkKey(event),
    evidence: checked,
  }
}
function routesFor(ctx) {
  const configs = ["source-channels", "watchlist", "acquisition", "source-recipes"]
  const inputs = configs.map((name) =>
    JSON.parse(fs.readFileSync(safePath(ctx.repo, `data/research-${name}.json`))),
  )
  return {
    routes: registry(...inputs),
    config_refs: configs.map((name) => reference(ctx.repo, `data/research-${name}.json`)),
  }
}
function validateTarget(target, route) {
  if (!route || route.collection_mode === "excluded")
    throw Error("Inquiry target must be a registered permitted source route")
  if (!queryMatchesLanguage(target.search_terms, route.language))
    throw Error("Inquiry search terms need the registered source language")
  if (/[\r\n]/.test(target.search_terms) || /(?:^|\s)site:|https?:\/\//i.test(target.search_terms))
    throw Error("Inquiry terms cannot replace the registered source host")
  if (new URL(route.url).protocol !== "https:")
    throw Error("Inquiry targeted search requires a registered HTTPS route")
}
function latestReview(ctx, questionId) {
  return readJSON(ctx.root, `inquiries/questions/${questionId}/latest.json`)
}
function reviewRecord(ctx, ref) {
  const record = checkedJSON(ctx.root, ref)
  if (
    record.schema !== "research-inquiry-review/v1" ||
    ref.path !==
      `inquiries/questions/${record.question.question_id}/reviews/${sha256(JSON.stringify(record))}.json`
  )
    throw Error("Exact immutable inquiry review required")
  return record
}
export function inquiryHistory(ctx, questionId, { checkCurrent = true } = {}) {
  let ref = latestReview(ctx, questionId),
    history = [],
    seen = new Set()
  while (ref) {
    if (seen.has(ref.sha256)) throw Error("Cyclic inquiry review history")
    seen.add(ref.sha256)
    const record = reviewRecord(ctx, ref)
    if (record.question.question_id !== questionId)
      throw Error("Inquiry review belongs to another question")
    if (
      history.length &&
      parseResearchDate(record.reviewed_at).instant >
        parseResearchDate(history.at(-1).record.reviewed_at).instant
    )
      throw Error("Inquiry review history reverses review times")
    if (record.decision === "activate")
      readEvent(ctx, record.activation.baseline, record.reviewed_at)
    else readEvent(ctx, record.observation.event, record.reviewed_at)
    history.push({ reference: ref, record })
    ref = record.previous_review
  }
  if (checkCurrent && history.length) currentQuestion(ctx, history[0].record.question)
  return history
}

export async function reviewInquiries(ctx, p) {
  const inputBytes = fs.readFileSync(safePath(ctx.repo, p.review_file)),
    input = JSON.parse(inputBytes)
  validateArguments(input, inquiryReviewSchema, ctx)
  // The native schema checker intentionally implements a small JSON Schema
  // subset. Validate the selected branch explicitly, including nested paths.
  input.questions.forEach((row) =>
    validateArguments(row, row.decision === "activate" ? activationSchema : observationSchema, ctx),
  )
  const poolRef = { path: p.pool_path, sha256: p.pool_sha256 }
  if (JSON.stringify(input.pool) !== JSON.stringify(poolRef))
    throw Error("Inquiry review must bind its exact prepared pool")
  const pool = loadInquiryPool(ctx, poolRef)
  if (new Set(input.questions.map((row) => row.question_id)).size !== input.questions.length)
    throw Error("An inquiry can be reviewed only once in each input")
  assertReviewDate(input.reviewed_at)
  const { routes } = routesFor(ctx)
  return withLock(ctx.root, "inquiry-review", () => {
    const existingReceipt = readJSON(ctx.root, `inquiries/runs/${p.run_id}/review-result.json`)
    if (existingReceipt) {
      if (existingReceipt.input_sha256 !== sha256(inputBytes))
        throw Error("Inquiry review input changed; use a new run ID")
      for (const ref of existingReceipt.reviews) reviewRecord(ctx, ref)
      return { ...existingReceipt, reused: true }
    }
    const records = input.questions.map((row) => {
      const question = pool.candidates.find((item) => item.question_id === row.question_id)
      if (!question) throw Error("Inquiry review names an unknown prepared question")
      const previous = latestReview(ctx, row.question_id)
      if (JSON.stringify(previous) !== JSON.stringify(row.previous_review))
        throw Error("Inquiry review must compare and preserve its exact previous decision")
      const history = inquiryHistory(ctx, row.question_id, { checkCurrent: false })
      if (history.length)
        assertReviewDate(input.reviewed_at, { notBefore: [history[0].record.reviewed_at] })
      let extra
      if (row.decision === "activate") {
        const event = readEvent(ctx, row.baseline, input.reviewed_at)
        if (
          new Set(row.source_targets.map((target) => target.channel_id)).size !==
          row.source_targets.length
        )
          throw Error("Unique inquiry source targets required")
        row.source_targets.forEach((target) =>
          validateTarget(
            target,
            routes.find((route) => route.channel_id === target.channel_id),
          ),
        )
        if (row.next_check_at && !parseResearchDate(row.next_check_at))
          throw Error("Valid inquiry next-check date required")
        extra = {
          activation: { ...row, baseline: row.baseline, baseline_event: event },
          status: "active",
        }
      } else {
        const activation = history.find((item) => item.record.decision === "activate")?.record
          .activation
        if (!activation) throw Error("Follow-up observations require a previously reviewed inquiry")
        if (history[0].record.status === "answered")
          throw Error(
            "Answered inquiry needs an explicit reactivation before another progress record",
          )
        const event = readEvent(ctx, row.event, input.reviewed_at)
        const baseline = readEvent(ctx, activation.baseline, input.reviewed_at)
        if (
          !baseline.evidence.some((proof) => proof.quote.includes(row.comparison.baseline_quote)) ||
          !event.evidence.some((proof) => proof.quote.includes(row.comparison.followup_quote))
        )
          throw Error("Inquiry comparison must quote the baseline and actual follow-up originals")
        if (row.observation_kind !== "context" && event.event_work_key === baseline.event_work_key)
          throw Error("Repeated evidence is not a new follow-up event")
        if (
          row.observation_kind !== "context" &&
          history.some(
            (item) =>
              item.record.observation?.followup_event.event_work_key === event.event_work_key,
          )
        )
          throw Error(
            "Previously reviewed follow-up evidence cannot create another progress record",
          )
        const firstDate = Math.max(
          ...baseline.evidence.map((proof) => parseResearchDate(proof.published_at).instant),
        )
        if (
          row.observation_kind !== "context" &&
          event.evidence.some((proof) => parseResearchDate(proof.published_at).instant < firstDate)
        )
          throw Error("Progress evidence cannot precede its reviewed baseline")
        if (row.observation_kind === "answer" && row.event_state !== "completed")
          throw Error("Planned or reported action cannot complete the target milestone")
        for (const value of [row.occurred_at, row.effective_at, row.next_check_at].filter(Boolean))
          if (!parseResearchDate(value))
            throw Error("Valid inquiry event and execution dates required")
        if (row.occurred_at) {
          if (!["reported", "in_progress", "completed"].includes(row.event_state))
            throw Error("A plan has an effective date, not a completed occurrence date")
          assertReviewDate(input.reviewed_at, { notBefore: [row.occurred_at] })
          if (
            event.evidence.every(
              (proof) =>
                row.occurred_at >
                (seoulPublicationDay(proof.published_at) ||
                  parseResearchDate(proof.published_at).day),
            )
          )
            throw Error("Actual occurrence date cannot follow all source publication dates")
          if (!event.evidence.some((proof) => proof.quote.includes(row.occurred_at)))
            throw Error("Occurrence date must appear in the directly reviewed event quote")
        }
        if (
          row.effective_at &&
          !event.evidence.some((proof) => proof.quote.includes(row.effective_at))
        )
          throw Error("Execution schedule must appear in the directly reviewed event quote")
        extra = {
          observation: { ...row, event: row.event, followup_event: event },
          status:
            row.observation_kind === "answer"
              ? "answered"
              : row.observation_kind === "counter_evidence"
                ? "needs_reassessment"
                : "active",
        }
      }
      return {
        schema: "research-inquiry-review/v1",
        question,
        pool: poolRef,
        decision: row.decision,
        previous_review: row.previous_review,
        reviewer: input.reviewer,
        reviewed_at: input.reviewed_at,
        ...extra,
        publication_approved: false,
      }
    })
    // Validate the complete batch before installing any question revisions.
    const reviews = records.map((record) =>
      immutable(
        ctx.root,
        `inquiries/questions/${record.question.question_id}/reviews/${sha256(JSON.stringify(record))}.json`,
        record,
      ),
    )
    records.forEach((record, index) =>
      atomicWrite(
        ctx.root,
        `inquiries/questions/${record.question.question_id}/latest.json`,
        reviews[index],
      ),
    )
    const receipt = {
      schema: "research-inquiry-review-result/v1",
      run_id: p.run_id,
      input_sha256: sha256(inputBytes),
      pool: poolRef,
      reviews,
      reviewed_questions: reviews.length,
      publication_approved: false,
    }
    immutable(ctx.root, `inquiries/runs/${p.run_id}/review-result.json`, receipt)
    return { ...receipt, reused: false }
  })
}

function activeQuestions(ctx, questionIds) {
  const folder = safePath(ctx.root, "inquiries/questions")
  const ids =
    questionIds ||
    (fs.existsSync(folder)
      ? fs
          .readdirSync(folder)
          .filter((name) => /^[a-f0-9]{64}$/.test(name))
          .sort()
      : [])
  if (new Set(ids).size !== ids.length) throw Error("Unique inquiry IDs required")
  return ids.map((questionId) => {
    const history = inquiryHistory(ctx, questionId)
    if (!history.length)
      throw Error("Inquiry needs an explicit source-backed review before search planning")
    return {
      question_id: questionId,
      latest: history[0],
      activation: history.find((item) => item.record.decision === "activate"),
      history,
    }
  })
}

export function planInquiries(ctx, p) {
  if (parseResearchDate(p.observation_day)?.precision !== "day")
    throw Error("Valid inquiry search observation day required")
  const { routes, config_refs } = routesFor(ctx),
    candidates = activeQuestions(ctx, p.question_ids),
    queries = [],
    held = [],
    questionRefs = []
  for (const candidate of candidates) {
    const latest = candidate.latest.record,
      activation = candidate.activation.record.activation
    questionRefs.push({
      question_id: candidate.question_id,
      review: candidate.latest.reference,
      activation: candidate.activation.reference,
    })
    const checkAt = latest.observation?.next_check_at || activation.next_check_at
    if (latest.status === "answered" || (checkAt && checkAt > p.observation_day)) {
      held.push({
        question_id: candidate.question_id,
        reason: latest.status === "answered" ? "answered" : "scheduled_future_check",
        next_check_at: checkAt,
      })
      continue
    }
    for (const target of activation.source_targets) {
      const route = routes.find((row) => row.channel_id === target.channel_id)
      validateTarget(target, route)
      const policy = readSourcePolicyState(ctx.root, route.url)
      if (
        policy?.assessment.status === "policy_restricted" ||
        policy?.assessment.requires_review === true ||
        policy?.public_access_restricted === true
      ) {
        held.push({
          question_id: candidate.question_id,
          channel_id: route.channel_id,
          reason: "source_policy_review",
          policy: policy.reference,
        })
        continue
      }
      const host = new URL(route.url).hostname
      const query = `site:${host} ${target.search_terms} ${p.observation_day.slice(0, 4)}`
      const duplicate = queries.find(
        (row) =>
          row.query.normalize("NFKC").toLowerCase() === query.normalize("NFKC").toLowerCase(),
      )
      const intent = {
        question_id: candidate.question_id,
        review: candidate.latest.reference,
        role: target.role,
        reason: target.reason,
        target_stage: activation.target_stage,
      }
      if (duplicate) {
        duplicate.inquiry_intents.push(intent)
        continue
      }
      queries.push({
        slot_id: `inquiry-${sha256(JSON.stringify([candidate.question_id, target.channel_id, query])).slice(0, 32)}`,
        scope: "registered-source",
        source_channel_id: route.channel_id,
        source_type: target.role,
        source_url: route.url,
        language: route.language,
        sector: activation.sector,
        region: route.region,
        axis: route.axis,
        query,
        inquiry_intents: [intent],
        role_is_search_intent: true,
      })
    }
  }
  if (queries.length) validateSearchQueries(queries)
  const maxQueries = p.max_queries ?? 8
  const plan = {
    schema: "research-inquiry-search-plan/v1",
    run_id: p.run_id,
    observation_day: p.observation_day,
    vault: ctx.vault,
    config_refs,
    questions: questionRefs,
    selection: { max_queries: maxQueries },
    queries: queries.slice(0, maxQueries),
    deferred_queries: queries.slice(maxQueries),
    held,
    source_body_confirmed: false,
    progress_confirmed: false,
    publication_approved: false,
  }
  const ref = immutable(ctx.root, `inquiries/runs/${p.run_id}/search-plan.json`, plan)
  const followupParents = []
  const seenParents = new Set()
  for (const candidate of candidates) {
    if (
      held.some(
        (row) =>
          row.question_id === candidate.question_id &&
          ["answered", "scheduled_future_check"].includes(row.reason),
      )
    )
      continue
    const activeIndex = candidate.history.findIndex((row) => row.record.decision === "activate")
    for (const { record } of candidate.history.slice(0, activeIndex + 1)) {
      const event =
        record.decision === "activate" ? record.activation.baseline : record.observation.event
      for (const proof of event.evidence) {
        const key = candidate.question_id + ":" + proof.material_id
        if (seenParents.has(key)) continue
        seenParents.add(key)
        followupParents.push({
          question_id: candidate.question_id,
          parent_material_id: proof.material_id,
          source_event: { plan: event.plan, group_id: event.group_id },
          source_published_at: proof.published_at,
          next_operation: "collection.followups",
          next_parameters: {
            run_id: "qfollow-" + sha256(ref.sha256 + ":" + key).slice(0, 24),
            mode: "plan-only",
            inquiry_plan_path: ref.path,
            inquiry_plan_sha256: ref.sha256,
            question_id: candidate.question_id,
            parent_material_id: proof.material_id,
          },
        })
      }
    }
  }
  return {
    ...ref,
    status: plan.queries.length ? "planned" : "no_permitted_query",
    question_count: questionRefs.length,
    query_count: plan.queries.length,
    deferred_queries: plan.deferred_queries.length,
    held,
    followup_parents: followupParents,
    next_operation: "collection.targeted",
    next_parameters: {
      run_id: `search-${sha256(p.run_id).slice(0, 24)}`,
      mode: "plan-only",
      inquiry_plan_path: ref.path,
      inquiry_plan_sha256: ref.sha256,
      max_queries: maxQueries,
    },
    network_requests: 0,
    progress_confirmed: false,
    publication_approved: false,
  }
}

export function loadInquirySearchPlan(ctx, ref) {
  const plan = checkedJSON(ctx.root, ref)
  if (
    plan.schema !== "research-inquiry-search-plan/v1" ||
    ref.path !== `inquiries/runs/${plan.run_id}/search-plan.json` ||
    plan.vault !== ctx.vault
  )
    throw Error("Exact reviewed inquiry search plan required")
  plan.config_refs.forEach((config) => checkedJSON(ctx.repo, config))
  const { routes } = routesFor(ctx)
  for (const question of plan.questions) {
    if (JSON.stringify(latestReview(ctx, question.question_id)) !== JSON.stringify(question.review))
      throw Error("Inquiry judgment changed; create a current search plan")
    const history = inquiryHistory(ctx, question.question_id)
    if (
      !history.some((row) => JSON.stringify(row.reference) === JSON.stringify(question.activation))
    )
      throw Error("Inquiry baseline revision changed")
  }
  for (const query of [...plan.queries, ...plan.deferred_queries]) {
    const route = routes.find((row) => row.channel_id === query.source_channel_id)
    if (
      !route ||
      route.collection_mode === "excluded" ||
      route.url !== query.source_url ||
      route.language !== query.language ||
      route.region !== query.region ||
      route.axis !== query.axis
    )
      throw Error("Inquiry registered search target changed")
    const policy = readSourcePolicyState(ctx.root, route.url)
    if (
      policy?.assessment.status === "policy_restricted" ||
      policy?.assessment.requires_review === true ||
      policy?.public_access_restricted === true
    )
      throw Error("Inquiry source now requires policy review")
  }
  if (plan.queries.length) validateSearchQueries(plan.queries)
  return plan
}

// Select only a material directly quoted by the current reviewed question.
// An event's existence in another plan, a company name or a canonical URL is
// insufficient. The original native bytes remain the source authority; this
// descriptor is never installed as a canonical parent candidate.
export function loadInquiryNativeParent(ctx, ref, questionId, materialId) {
  if (!/^[a-f0-9]{64}$/.test(materialId || ""))
    throw Error("Exact native inquiry parent material ID required")
  const plan = loadInquirySearchPlan(ctx, ref)
  const target = plan.questions.find((row) => row.question_id === questionId)
  if (!target) throw Error("Native parent question is not in the reviewed inquiry plan")
  if (
    plan.held.some(
      (row) =>
        row.question_id === questionId &&
        ["answered", "scheduled_future_check"].includes(row.reason),
    )
  )
    throw Error("Native follow-up parent requires an active and due inquiry")
  const history = inquiryHistory(ctx, questionId)
  const activeIndex = history.findIndex((row) => row.record.decision === "activate")
  const matches = history.slice(0, activeIndex + 1).flatMap(({ reference: reviewRef, record }) => {
    const input =
      record.decision === "activate" ? record.activation.baseline : record.observation.event
    if (!input.evidence.some((proof) => proof.material_id === materialId)) return []
    const native = checkedPlan(ctx, input.plan, input.group_id)
    const event = native.events.find((row) => row.group_id === input.group_id)
    const source = event.sources.find((row) => row.material_id === materialId)
    if (!source) throw Error("Inquiry parent material no longer belongs to its reviewed event")
    const evidence = readEvent(ctx, input, record.reviewed_at).evidence.filter(
      (proof) => proof.material_id === materialId,
    )
    return [
      {
        review: reviewRef,
        plan: input.plan,
        group_id: input.group_id,
        material_id: materialId,
        source,
        evidence,
      },
    ]
  })
  if (!matches.length)
    throw Error("Native parent must be a directly cited material of the current inquiry")
  const fingerprints = new Set(
    matches.map(({ source }) =>
      JSON.stringify([source.source_version_id, source.parse_id, source.url]),
    ),
  )
  if (fingerprints.size !== 1) throw Error("Conflicting native inquiry parent source identities")
  const first = matches
    .slice()
    .sort((a, b) => a.source.source_run.localeCompare(b.source.source_run))[0]
  const selected = selectStoredSources(ctx.root, first.source.source_run, [first.source.url])
  const document = selected.documents[0],
    parse = selected.parses[0]
  if (
    selected.documents.length !== 1 ||
    selected.parses.length !== 1 ||
    document.source_version_id !== first.source.source_version_id ||
    parse.parse_id !== first.source.parse_id ||
    parse.source_version_id !== first.source.source_version_id ||
    !["captured", "not_modified"].includes(document.fetch_status) ||
    !["extracted", "partial"].includes(parse.status)
  )
    throw Error("Native inquiry parent differs from its exact stored source selection")
  const native = {
    kind: "reviewed-inquiry-material",
    inquiry_plan: ref,
    question_id: questionId,
    question_review: target.review,
    material_id: materialId,
    source_run: first.source.source_run,
    event_refs: matches.map(({ review, plan: eventPlan, group_id, evidence }) => ({
      review,
      plan: eventPlan,
      group_id,
      evidence,
    })),
    source_published_at: parse.dates?.published_at || null,
    parent_registered: false,
    publication_approved: false,
  }
  return {
    candidate: {
      key: "source-" + sourceId(first.source.url),
      title: parse.title,
      source_urls: [first.source.url],
    },
    source_attempt_id: null,
    handoffHash: null,
    selected,
    native,
  }
}

// A body link remains a lead. Its question binding proves search provenance,
// never a corporate relation, linked content, execution or article approval.
export function inquiryFollowupBinding(ctx, ref, questionId, parent, leads) {
  const plan = loadInquirySearchPlan(ctx, ref)
  const target = plan.questions.find((row) => row.question_id === questionId)
  if (!target) throw Error("Follow-up question is not in the reviewed search plan")
  const history = inquiryHistory(ctx, questionId),
    activation = history.find((row) => row.record.decision === "activate").record.activation
  const events = history.flatMap((row) =>
    row.record.decision === "activate"
      ? [row.record.activation.baseline_event]
      : [row.record.observation.followup_event],
  )
  if (
    !events.some((event) =>
      event.evidence.some(
        (proof) =>
          proof.source_version_id === parent.source_version_id &&
          proof.parse_id === parent.parse_id &&
          canonicalURL(proof.url) === canonicalURL(parent.url),
      ),
    )
  )
    throw Error("Follow-up parent must be an exact reviewed inquiry event source")
  return {
    inquiry_plan: ref,
    question_id: questionId,
    review: target.review,
    target_stage: activation.target_stage,
    selected_urls: leads.map((lead) => lead.url),
    confirmed_relation: false,
    progress_confirmed: false,
    publication_approved: false,
  }
}

export function inquiryStatus(ctx, p) {
  const folder = safePath(ctx.root, "inquiries/questions"),
    ids =
      p.question_ids ||
      (fs.existsSync(folder)
        ? fs
            .readdirSync(folder)
            .filter((name) => /^[a-f0-9]{64}$/.test(name))
            .sort()
        : [])
  const items = ids.map((questionId) => {
    try {
      const history = inquiryHistory(ctx, questionId)
      if (!history.length) return { question_id: questionId, status: "unreviewed", history: [] }
      const latest = history[0].record,
        activation = history.find((row) => row.record.decision === "activate").record.activation
      return {
        question_id: questionId,
        question: latest.question.question,
        source: latest.question.source,
        status: latest.status,
        target_stage: activation.target_stage,
        criterion: activation.criterion,
        next_check_at: latest.observation?.next_check_at || activation.next_check_at,
        baseline: activation.baseline_event,
        history: history
          .slice()
          .reverse()
          .map(({ reference: ref, record }) => ({
            reference: ref,
            decision: record.decision,
            reviewed_at: record.reviewed_at,
            reviewer: record.reviewer,
            status: record.status,
            ...(record.observation
              ? {
                  observation_kind: record.observation.observation_kind,
                  event_state: record.observation.event_state,
                  occurred_at: record.observation.occurred_at,
                  effective_at: record.observation.effective_at,
                  comparison: record.observation.comparison,
                  event: record.observation.followup_event,
                }
              : {}),
          })),
      }
    } catch (error) {
      return {
        question_id: questionId,
        status: "requires_recheck",
        reason: error.message,
        progress_confirmed: false,
      }
    }
  })
  const poolRef = p.pool_path
    ? { path: p.pool_path, sha256: p.pool_sha256 }
    : readJSON(ctx.root, "inquiries/latest-pool.json")
  const pool = poolRef ? checkedJSON(ctx.root, poolRef) : null
  return {
    schema: "research-inquiry-status/v1",
    pool: poolRef,
    candidate_count: pool?.candidates.length || 0,
    pending_candidates: (pool?.candidates || []).filter(
      (row) => !latestReview(ctx, row.question_id),
    ),
    items,
    network_requests: 0,
    publication_approved: false,
  }
}

export async function advanceInquiries(ctx, p) {
  validateArguments(p, inquiryInputSchema, ctx)
  if (Boolean(p.pool_path) !== Boolean(p.pool_sha256))
    throw Error("Inquiry pool path and SHA are required together")
  if (p.mode !== "status" && !p.run_id) throw Error("Inquiry mutation needs a run ID")
  if (p.mode === "prepare")
    return withLock(ctx.root, "inquiry-prepare", () => prepareInquiries(ctx, p))
  if (p.mode === "review") {
    if (!p.pool_path || !p.review_file)
      throw Error("Inquiry review needs a pool and an explicit source-reading review file")
    return reviewInquiries(ctx, p)
  }
  if (p.mode === "plan") return withLock(ctx.root, "inquiry-plan", () => planInquiries(ctx, p))
  return inquiryStatus(ctx, p)
}
