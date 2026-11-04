import fs from "node:fs"
import path from "node:path"
import { editions, extractArticles, canonicalURL, parseNote } from "../garden.mjs"
import { SECTORS } from "../sectors.mjs"
import { sha256, assertSchema } from "./contracts.mjs"
import {
  checkedPlan,
  loadSelectedEvent,
  eventWorkKey,
  eventWriterBinding,
  reviewEditionEvents,
} from "./event-pipeline.mjs"
import {
  parseResearchDate,
  assertReviewDate,
  samePublicationDate,
  seoulPublicationDay,
} from "./dates.mjs"
import { readBacklog } from "../research-window.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { createModelProvider, createModelExecutionWindow } from "./model-provider.mjs"
import { prepareRoleProvider, resolveRolePolicy } from "./model-policy.mjs"
import {
  verifiedJSON,
  memoizeVerifiedInput,
  trackVerifiedPath,
  measureVerifiedInputStage,
  withVerifiedInputSession,
  assertVerifiedInputBoundary,
} from "./verified-inputs.mjs"
import { assertNoOperationalWriter } from "./operations-deployment.mjs"
import { currentRequestOwner } from "./request-ownership.mjs"
import {
  compositionProfileSchema,
  validateCompositionProfile,
  readBriefingCompositionPolicy,
  selectBriefingComposition,
} from "./briefing-composition.mjs"

export const CURATION_METRICS = [
  "novelty",
  "impact",
  "specificity",
  "knowledge_value",
  "timeliness",
]
const checks = [
  "source_verified",
  "scope_relevant",
  "new_information",
  "current_valid",
  "history_compared",
]
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
const immutable = (root, file, value) => {
  const before = readJSON(root, file)
  if (before && !same(before, value)) throw Error("Curation input changed; use a new run")
  return before ? reference(root, file) : atomicCreate(root, file, value)
}
function pinned(root, ref) {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256 || ""))
    throw Error("Exact curation reference required")
  return verifiedJSON(safePath(root, ref.path), ref.sha256)
}
export function readCurationPolicy(ctx) {
  const value = JSON.parse(
    fs.readFileSync(safePath(ctx.repo, "data/research-curation-policy.json")),
  )
  if (
    value.schema !== "research-curation-policy/v1" ||
    !value.version ||
    Object.keys(value).some(
      (k) =>
        ![
          "schema",
          "version",
          "weights",
          "minimum_score",
          "priority_score",
          "max_articles",
          "max_per_sector",
          "require_reviewed_scores",
        ].includes(k),
    ) ||
    !same(Object.keys(value.weights || {}).sort(), [...CURATION_METRICS].sort()) ||
    CURATION_METRICS.some((k) => !Number.isInteger(value.weights[k]) || value.weights[k] < 0) ||
    Object.values(value.weights).reduce((sum, weight) => sum + weight, 0) !== 100 ||
    !Number.isInteger(value.minimum_score) ||
    value.minimum_score < 0 ||
    value.minimum_score > 100 ||
    !Number.isInteger(value.priority_score) ||
    value.priority_score < value.minimum_score ||
    value.priority_score > 100 ||
    !Number.isInteger(value.max_articles) ||
    value.max_articles < 1 ||
    value.max_articles > 40 ||
    !Number.isInteger(value.max_per_sector) ||
    value.max_per_sector < 1 ||
    value.max_per_sector > 5 ||
    value.require_reviewed_scores !== true
  )
    throw Error("Invalid curation policy")
  return value
}
function trackEditionHistory(directory) {
  trackVerifiedPath(directory)
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw Error("Curation publication history cannot follow symlinks")
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".")) trackEditionHistory(file)
    } else if (entry.name.endsWith(".md")) trackVerifiedPath(file)
  }
}
function history(ctx) {
  // Only a verified invocation can reuse this history. Track the backlog and
  // directory listings as well as existing files so additions invalidate it.
  if (trackVerifiedPath(ctx.backlog)) trackEditionHistory(path.join(ctx.vault, "Editions"))
  const all = editions(ctx.vault)
  const files = all.map((e) => reference(ctx.vault, path.relative(ctx.vault, e.file)))
  const articles = new Map()
  for (const edition of all)
    for (const article of extractArticles(edition)) {
      if (["excluded", "공개 제외"].includes(article.review?.review_status)) continue
      articles.set(article.id, {
        id: article.id,
        title: article.title,
        body: article.body,
        urls: article.urls,
        first_featured_at: articles.get(article.id)?.first_featured_at || String(edition.meta.date),
        source_published_at: article.review?.published_at || null,
        review_status: article.review?.review_status || "unreviewed",
      })
    }
  const newsDir = safePath(ctx.vault, "News")
  const readNews = (directory) => {
    trackVerifiedPath(directory)
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error("Curation publication history cannot follow symlinks")
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        readNews(full)
        continue
      }
      if (!entry.name.endsWith(".md")) continue
      files.push(reference(ctx.vault, path.relative(ctx.vault, full)))
      const { meta, body } = parseNote(fs.readFileSync(full, "utf8"))
      if (
        meta.type !== "news" ||
        !meta.event_id ||
        ["excluded", "공개 제외"].includes(meta.review_status)
      )
        continue
      const before = articles.get(meta.event_id)
      articles.set(meta.event_id, {
        id: meta.event_id,
        title: meta.title,
        body,
        urls: meta.sources || (meta.source_url ? [meta.source_url] : before?.urls || []),
        first_featured_at: before?.first_featured_at || String(meta.date || meta.created || ""),
        source_published_at: meta.published_at || before?.source_published_at || null,
        review_status: meta.review_status || "unreviewed",
      })
    }
  }
  readNews(newsDir)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const backlog = readBacklog(ctx.backlog)
  if (!backlog)
    throw Error("Stored candidate backlog required; missing history is not an empty history")
  return {
    files,
    articles: [...articles.values()],
    backlog_sha256: backlog ? sha256(fs.readFileSync(ctx.backlog)) : null,
    candidates: backlog?.candidates || [],
  }
}
function sourcePacket(ctx, plan, event, includeBlocks = true) {
  return event.sources.map((source) => {
    const parsed = readJSON(ctx.root, `parses/${source.parse_id}/parse.json`)
    if (!parsed) throw Error("Curation original parse required")
    const blocks = source.block_ids.map((id) => {
      const block = parsed.blocks.find((b) => b.block_id === id)
      if (!block) throw Error("Curation original block missing")
      return { block_id: id, text: block.text }
    })
    return {
      ...source,
      title: parsed.title,
      published_at: parsed.dates?.published_at || null,
      parse_sha256: sha256(
        fs.readFileSync(safePath(ctx.root, `parses/${source.parse_id}/parse.json`)),
      ),
      ...(includeBlocks ? { blocks } : {}),
    }
  })
}
// Search the already loaded history without normalizing the same article body
// and URL again for every event. This is invocation-local: it neither creates
// a new source of truth nor changes which historical articles are compared.
export function createCurationHistorySearch(inventory) {
  const normalized = new WeakMap(),
    urls = new Map(),
    articleIds = new Set(inventory.articles.map((article) => article.id))
  const url = (value) => {
    if (!urls.has(value)) urls.set(value, canonicalURL(value))
    return urls.get(value)
  }
  const text = (article) => {
    if (!normalized.has(article))
      normalized.set(article, (article.title + "\n" + article.body).normalize("NFKC").toLowerCase())
    return normalized.get(article)
  }
  return {
    articleIds,
    url,
    related(sources, identity) {
      const tokens = [identity.who, identity.object, identity.external_id]
          .filter((value) => value && value.length > 2)
          .map((value) => value.normalize("NFKC").toLowerCase()),
        sourceUrls = new Set(sources.map((source) => url(source.url)))
      return {
        sourceUrls,
        articles: inventory.articles.filter(
          (article) =>
            article.urls.some((value) => sourceUrls.has(url(value))) ||
            tokens.some((token) => text(article).includes(token)),
        ),
        candidates: inventory.candidates.filter((candidate) =>
          (candidate.source_urls || []).some((value) => sourceUrls.has(url(value))),
        ),
      }
    },
  }
}
function poolCandidate(ctx, planRef, plan, event, inventory, historySearch) {
  const sources = sourcePacket(ctx, plan, event, false)
  const {
    sourceUrls,
    articles: related,
    candidates: known,
  } = measureVerifiedInputStage("related_article_lookup", () =>
    historySearch.related(sources, event.identity),
  )
  let execution = { plan: planRef, group_id: event.group_id }
  const binding = eventWriterBinding(ctx, planRef, event, {
    globalOnly: true,
    useRecoveryScope: false,
  })
  if (binding) {
    const selected = loadSelectedEvent(ctx, {
      run_id: binding.writer_run,
      selection_path: binding.selection.path,
      selection_sha256: binding.selection.sha256,
    })
    const original = checkedPlan(ctx, selected.plan, selected.group_id).events.find(
      (e) => e.group_id === selected.group_id,
    )
    if (!original || eventWorkKey(original) !== eventWorkKey(event))
      throw Error("Curation writer reuse identity changed")
    execution = { plan: selected.plan, group_id: selected.group_id }
  }
  const identity_key = sha256(
    JSON.stringify(
      Object.fromEntries(
        ["who", "action", "object", "occurred_at", "external_id"].map((k) => [
          k,
          typeof event.identity[k] === "string"
            ? event.identity[k].normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()
            : event.identity[k],
        ]),
      ),
    ),
  )
  return {
    candidate_id: sha256(JSON.stringify([planRef, event.group_id])),
    identity_key,
    origin_plan: planRef,
    group_id: event.group_id,
    action: event.action,
    identity: event.identity,
    source_published_at: sources.find((s) => s.role === "primary")?.published_at || null,
    sources,
    prior: event.prior,
    related_articles: related.map(({ body, ...article }) => ({
      ...article,
      body_sha256: sha256(body),
    })),
    already_featured:
      (event.action === "reuse" && historySearch.articleIds.has(event.prior?.event_id)) ||
      (event.action === "write" &&
        !event.prior &&
        related.some((a) => a.urls.some((url) => sourceUrls.has(historySearch.url(url))))) ||
      (known.some((c) => historySearch.articleIds.has(c.event_id)) &&
        event.action === "write" &&
        !event.prior),
    execution,
  }
}

// Only the backlog may change under this narrow revalidation. Published files
// must be byte-identical, and every frozen candidate's native featured test
// must remain identical. No score, review, approval or selection is created.
function backlogHistoryImpact(pool, current) {
  if (!same(pool.history?.files, current.files))
    throw Error("Published article history changed; prepare a new curation pool")
  if (!Array.isArray(pool.candidates) || !Array.isArray(current.candidates))
    throw Error("Exact curation candidate history required")
  const articleIds = new Set(current.articles.map((article) => article.id))
  const knownUrls = new Set()
  for (const candidate of current.candidates) {
    if (candidate.source_urls != null && !Array.isArray(candidate.source_urls))
      throw Error("Exact candidate source URLs required")
    const urls = (candidate.source_urls || []).map(canonicalURL)
    if (articleIds.has(candidate.event_id)) for (const url of urls) knownUrls.add(url)
  }
  const changed = []
  const ids = new Set()
  for (const row of pool.candidates) {
    if (
      !row?.candidate_id ||
      ids.has(row.candidate_id) ||
      !Array.isArray(row.sources) ||
      !Array.isArray(row.related_articles) ||
      row.related_articles.some((article) => !Array.isArray(article.urls)) ||
      typeof row.already_featured !== "boolean"
    )
      throw Error("Exact frozen curation candidate history required")
    ids.add(row.candidate_id)
    const urls = new Set(row.sources.map((source) => canonicalURL(source.url)))
    const related = row.related_articles.some((article) =>
      (article.urls || []).some((url) => urls.has(canonicalURL(url))),
    )
    const known = [...urls].some((url) => knownUrls.has(url))
    const featured =
      (row.action === "reuse" && articleIds.has(row.prior?.event_id)) ||
      (row.action === "write" && !row.prior && (related || known))
    if (featured !== row.already_featured) changed.push(row.candidate_id)
  }
  return changed
}

function historyRevalidationRecord(ref, pool, current) {
  const files = [
    new URL("./curation.mjs", import.meta.url),
    new URL("../garden.mjs", import.meta.url),
    new URL("../research-window.mjs", import.meta.url),
    new URL("./contracts.mjs", import.meta.url),
  ]
  return {
    schema: "research-curation-history-revalidation/v1",
    pool: { path: ref.path, sha256: ref.sha256 },
    previous_history_sha256: sha256(JSON.stringify(pool.history)),
    current_history_sha256: sha256(
      JSON.stringify({ files: current.files, backlog_sha256: current.backlog_sha256 }),
    ),
    previous_backlog_sha256: pool.history.backlog_sha256,
    current_backlog_sha256: current.backlog_sha256,
    policy_sha256: sha256(JSON.stringify(pool.policy)),
    implementation_sha256: sha256(
      JSON.stringify(files.map((file) => sha256(fs.readFileSync(file)))),
    ),
    candidates_sha256: sha256(JSON.stringify(pool.candidates)),
    candidate_count: pool.candidates.length,
    changed_candidates: 0,
    candidate_approved: false,
    candidate_published: false,
  }
}

function historyRevalidationPath(pool, record) {
  return `curation/runs/${pool.run_id}/history-revalidations/${sha256(JSON.stringify(record))}.json`
}

export async function revalidateCurationHistory(ctx, p) {
  if (p.apply !== undefined && typeof p.apply !== "boolean")
    throw Error("Explicit boolean history revalidation apply required")
  const ref = { path: p.pool_path, sha256: p.pool_sha256 }
  const initial = loadCurationPool(ctx, ref, { checkHistory: false, candidateIds: [] })
  return withLock(ctx.root, "curation-history-" + initial.run_id, () => {
    assertNoOperationalWriter(ctx.repo, {
      researchRoot: ctx.root,
      ownedRequest: currentRequestOwner(),
    })
    const pool = loadCurationPool(ctx, ref, { checkHistory: false, candidateIds: [] })
    ctx = {
      ...pool.context,
      ...ctx,
      repo: ctx.repo || pool.context.repo,
      backlog: ctx.backlog || pool.context.backlog,
    }
    if (!same(pool.policy, readCurationPolicy(ctx)))
      throw Error("Curation policy changed; prepare a new pool")
    const current = history(ctx)
    if (same(pool.history, { files: current.files, backlog_sha256: current.backlog_sha256 }))
      return { status: "already_current", candidate_approved: false, candidate_published: false }
    const changed = backlogHistoryImpact(pool, current)
    if (changed.length) throw Error("Curation candidate history changed; prepare a new pool")
    if (p.apply !== true)
      return {
        status: "revalidation_ready",
        candidate_count: pool.candidates.length,
        changed_candidates: 0,
        previous_backlog_sha256: pool.history.backlog_sha256,
        current_backlog_sha256: current.backlog_sha256,
        candidate_approved: false,
        candidate_published: false,
      }
    const after = history(ctx)
    if (
      !same(
        { files: current.files, backlog_sha256: current.backlog_sha256 },
        { files: after.files, backlog_sha256: after.backlog_sha256 },
      )
    )
      throw Error("Curation history changed during revalidation")
    const record = historyRevalidationRecord(ref, pool, after)
    const saved = immutable(ctx.root, historyRevalidationPath(pool, record), record)
    return {
      ...saved,
      status: "revalidated",
      changed_candidates: 0,
      candidate_approved: false,
      candidate_published: false,
    }
  })
}

// Persist references to existing reviewed events, never a second source/news DB.
export async function prepareCuration(ctx, p) {
  const policy = readCurationPolicy(ctx)
  const date = parseResearchDate(p.briefing_date)
  if (!date || date.precision !== "day") throw Error("Valid briefing date required")
  const file = `curation/runs/${p.run_id}/pool.json`
  const prior = readJSON(ctx.root, file)
  const input = {
    briefing_date: p.briefing_date,
    plans: p.plans,
    include_backlog: p.include_backlog !== false,
    max_articles: p.max_articles ?? policy.max_articles,
  }
  if (
    !Number.isInteger(input.max_articles) ||
    input.max_articles < 1 ||
    input.max_articles > policy.max_articles
  )
    throw Error("Curation article budget exceeds policy")
  if (prior) {
    if (!same(input, prior.input)) throw Error("Curation pool changed; use a new run")
    loadCurationPool(ctx, reference(ctx.root, file))
    return {
      ...reference(ctx.root, file),
      candidates: prior.candidates.length,
      candidate_entries: prior.candidates,
      reused: true,
    }
  }
  return withLock(ctx.root, "curation-queue", () => {
    const queue = readJSON(ctx.root, "curation/queue.json") || {
      schema: "research-curation-queue/v1",
      plans: [],
    }
    if (queue.schema !== "research-curation-queue/v1" || !Array.isArray(queue.plans))
      throw Error("Invalid curation queue")
    const refs = [
      ...new Map(
        [...(input.include_backlog ? queue.plans : []), ...p.plans].map((ref) => [ref.path, ref]),
      ).values(),
    ]
    const inventory = history(ctx),
      historySearch = createCurationHistorySearch(inventory),
      candidates = [],
      blocked = []
    for (const ref of refs) {
      try {
        const plan = checkedPlan(ctx, ref)
        candidates.push(
          ...plan.events.map((event) =>
            poolCandidate(ctx, ref, plan, event, inventory, historySearch),
          ),
        )
      } catch (error) {
        if (p.plans.some((current) => same(current, ref))) throw error
        blocked.push({ plan: ref, status: "requires_recheck", error: error.message })
      }
    }
    const pool = {
      schema: "research-curation-pool/v1",
      run_id: p.run_id,
      input,
      policy,
      context: {
        repo: fs.realpathSync(ctx.repo),
        vault: path.resolve(ctx.vault),
        backlog: path.resolve(ctx.backlog),
      },
      history: { files: inventory.files, backlog_sha256: inventory.backlog_sha256 },
      candidates,
      blocked_plans: blocked,
      source_gets: 0,
      model_calls: 0,
      candidate_published: false,
    }
    const result = immutable(ctx.root, file, pool)
    // A scoped selection must not replace the durable backlog with its subset.
    // Its explicit plans remain pinned by the pool and can be queued separately.
    if (input.include_backlog)
      atomicWrite(ctx.root, "curation/queue.json", { schema: queue.schema, plans: refs })
    return {
      ...result,
      candidates: candidates.length,
      candidate_entries: candidates,
      carried_plans: refs.length - p.plans.length,
      blocked_plans: blocked,
      reused: false,
    }
  })
}
export function loadCurationPool(ctx, ref, { checkHistory = true, candidateIds } = {}) {
  const pool = pinned(ctx.root, ref)
  if (
    pool.schema !== "research-curation-pool/v1" ||
    ref.path !== `curation/runs/${pool.run_id}/pool.json`
  )
    throw Error("Native curation pool required")
  const scope = pool.context
  if (
    !scope ||
    !path.relative(scope.repo, path.resolve(ctx.root)).startsWith(".local" + path.sep) ||
    path.relative(scope.repo, scope.backlog).startsWith("..") ||
    path.relative(scope.repo, scope.vault).startsWith("..") ||
    (ctx.repo && fs.realpathSync(ctx.repo) !== scope.repo) ||
    path.resolve(ctx.vault) !== scope.vault
  )
    throw Error("Curation repository, vault or private root changed")
  ctx = { ...scope, ...ctx, repo: ctx.repo || scope.repo, backlog: ctx.backlog || scope.backlog }
  if (checkHistory && !same(pool.policy, readCurationPolicy(ctx)))
    throw Error("Curation policy changed; prepare a new pool")
  const current = checkHistory ? history(ctx) : null,
    historySearch = current ? createCurationHistorySearch(current) : null
  if (
    checkHistory &&
    !same(pool.history, { files: current.files, backlog_sha256: current.backlog_sha256 })
  ) {
    const record = historyRevalidationRecord(ref, pool, current)
    const saved = readJSON(ctx.root, historyRevalidationPath(pool, record))
    if (!saved || !same(saved, record) || backlogHistoryImpact(pool, current).length)
      throw Error("Published article history changed; prepare a new curation pool")
  }
  if (candidateIds !== undefined && !Array.isArray(candidateIds))
    throw Error("Exact distinct curation candidate scope required")
  const targets =
    candidateIds === undefined
      ? pool.candidates
      : pool.candidates.filter((row) => candidateIds.includes(row.candidate_id))
  if (
    candidateIds &&
    (new Set(candidateIds).size !== candidateIds.length || targets.length !== candidateIds.length)
  )
    throw Error("Exact distinct curation candidate scope required")
  for (const row of targets) {
    const plan = checkedPlan(ctx, row.origin_plan, row.group_id)
    const event = plan.events.find((e) => e.group_id === row.group_id)
    if (
      !event ||
      (checkHistory
        ? !same(row, poolCandidate(ctx, row.origin_plan, plan, event, current, historySearch))
        : !same(row.sources, sourcePacket(ctx, plan, event, false)) ||
          !same(row.identity, event.identity) ||
          row.action !== event.action)
    )
      throw Error("Curation candidate source or writer binding changed")
  }
  return pool
}
const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["material_id", "block_id", "quote"],
  properties: {
    material_id: { type: "string" },
    block_id: { type: "string" },
    quote: { type: "string", minLength: 8, maxLength: 4000 },
  },
}
export const curationEvaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidate_id",
    "sector",
    "checks",
    "ratings",
    "evidence",
    "compared_article_ids",
    "valid_until",
  ],
  properties: {
    candidate_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
    sector: { type: "string", enum: SECTORS },
    checks: {
      type: "object",
      additionalProperties: false,
      required: checks,
      properties: Object.fromEntries(checks.map((k) => [k, { type: "boolean" }])),
    },
    ratings: {
      type: "object",
      additionalProperties: false,
      required: CURATION_METRICS,
      properties: Object.fromEntries(
        CURATION_METRICS.map((k) => [
          k,
          {
            type: "object",
            additionalProperties: false,
            required: ["value", "reason"],
            properties: {
              value: { type: "integer", minimum: 0, maximum: 5 },
              reason: { type: "string", minLength: 1, maxLength: 1500 },
            },
          },
        ]),
      ),
    },
    evidence: { type: "array", minItems: 1, maxItems: 20, items: evidenceSchema },
    compared_article_ids: {
      type: "array",
      uniqueItems: true,
      maxItems: 500,
      items: { type: "string" },
    },
    valid_until: { type: ["string", "null"] },
    composition: compositionProfileSchema,
    relation_candidates: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "previous_article_id",
          "kind",
          "status",
          "reason",
          "current_evidence",
          "prior_article_quote",
        ],
        properties: {
          previous_article_id: { type: "string", minLength: 1, maxLength: 160 },
          kind: {
            type: "string",
            enum: ["followup", "correction", "contradiction", "planned_to_completed"],
          },
          status: { type: "string", enum: ["unreviewed"] },
          reason: { type: "string", minLength: 10, maxLength: 1000 },
          current_evidence: evidenceSchema,
          prior_article_quote: { type: "string", minLength: 8, maxLength: 4000 },
        },
      },
    },
  },
}
export function curationCandidatePacket(ctx, candidate, { forModel = false } = {}) {
  const plan = checkedPlan(ctx, candidate.origin_plan, candidate.group_id)
  const event = plan.events.find((e) => e.group_id === candidate.group_id)
  const sources = sourcePacket(ctx, plan, event)
  if (forModel)
    for (const source of sources) {
      const citations = event.materials.find((m) => m.material_id === source.material_id).evidence
      source.blocks = [
        ...new Map(
          citations.map((c) => [
            c.block_id + "\n" + c.quote,
            { block_id: c.block_id, text: c.quote },
          ]),
        ).values(),
      ]
    }
  return {
    ...candidate,
    sources,
    source_scope: forModel ? "reviewed_event_citations" : "selected_original_blocks",
    // A verified curation invocation can prepare many independent article
    // packets. Reuse its exact tracked history, while the existing session
    // boundary still rechecks file bytes and directory listings before save.
    // Explicit history revalidation continues to call history() afresh.
    related_articles: measureVerifiedInputStage("related_article_packet", () =>
      memoizeVerifiedInput(ctx, "curation-candidate-history", () => history(ctx)).articles.filter(
        (a) => candidate.related_articles.some((r) => r.id === a.id),
      ),
    ),
  }
}
function validateEvaluation(row, candidate, ctx) {
  assertSchema(row, curationEvaluationSchema)
  if (row.candidate_id !== candidate.candidate_id) throw Error("Exact curation candidate required")
  for (const metric of CURATION_METRICS) {
    const rating = row.ratings[metric]
    if (
      !Number.isInteger(rating.value) ||
      rating.value < 0 ||
      rating.value > 5 ||
      !rating.reason.trim()
    )
      throw Error("Curation rating requires bounded value and evidence-based reason")
  }
  if (
    !same([...row.compared_article_ids].sort(), candidate.related_articles.map((a) => a.id).sort())
  )
    throw Error(
      "Curation must compare all retrieved article history; retrieval is not identity proof",
    )
  const plan = checkedPlan(ctx, candidate.origin_plan, candidate.group_id)
  const sources = sourcePacket(
    ctx,
    plan,
    plan.events.find((e) => e.group_id === candidate.group_id),
  )
  for (const cite of row.evidence) {
    const source = sources.find((s) => s.material_id === cite.material_id)
    const block = source?.blocks.find((b) => b.block_id === cite.block_id)
    if (!block || !block.text.includes(cite.quote))
      throw Error("Curation evidence is outside the exact original block")
  }
  if (row.relation_candidates?.length) {
    const priorHistory = memoizeVerifiedInput(ctx, "curation-candidate-history", () =>
        history(ctx),
      ),
      seen = new Set()
    for (const relation of row.relation_candidates) {
      const previous = priorHistory.articles.find(
          (article) => article.id === relation.previous_article_id,
        ),
        frozen = candidate.related_articles.find(
          (article) => article.id === relation.previous_article_id,
        ),
        current = sources.find(
          (source) => source.material_id === relation.current_evidence.material_id,
        ),
        block = current?.blocks.find(
          (entry) => entry.block_id === relation.current_evidence.block_id,
        ),
        key = relation.previous_article_id + "|" + relation.kind
      if (
        seen.has(key) ||
        relation.reason.trim().length < 10 ||
        relation.prior_article_quote.trim().length < 8 ||
        relation.current_evidence.quote.trim().length < 8 ||
        !previous ||
        previous.review_status !== "verified" ||
        !frozen ||
        sha256(previous.body) !== frozen.body_sha256 ||
        !previous.body.includes(relation.prior_article_quote) ||
        !block?.text.includes(relation.current_evidence.quote)
      )
        throw Error(
          "Unreviewed event relation candidate requires exact current source and verified prior article evidence",
        )
      seen.add(key)
    }
  }
  validateCompositionProfile(row.composition, sources)
  if (row.valid_until !== null && parseResearchDate(row.valid_until)?.precision !== "day")
    throw Error("Curation validity date must be an explicit source-based day or null")
  return row
}
function evaluationKey(pool, row) {
  return sha256(
    JSON.stringify([
      pool.policy,
      row.candidate_id,
      row.action,
      row.identity,
      row.sources,
      row.prior,
      row.related_articles,
    ]),
  )
}
const evaluationPath = (pool, row) => `curation/evaluations/${evaluationKey(pool, row)}/latest.json`
function reviewedEvaluation(ctx, pool, row) {
  const pointer = readJSON(ctx.root, evaluationPath(pool, row))
  return pointer
    ? { record: pinned(ctx.root, pointer.reference), reference: pointer.reference }
    : null
}

// A source comparison is an explicit editorial decision, not a URL or name
// heuristic. Both candidates retain their original ratings and citations.
export function checkedIdentityReview(ctx, poolRef, pool, review) {
  assertSchema(review, {
    type: "object",
    additionalProperties: false,
    required: ["schema", "pool_sha256", "reviewer", "reviewed_at", "pairs"],
    properties: {
      schema: { type: "string", enum: ["research-curation-identity-review/v1"] },
      pool_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      reviewer: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
      reviewed_at: { type: "string", minLength: 1 },
      pairs: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["candidate_ids", "preferred_candidate_id", "verdict", "reason", "evidence"],
          properties: {
            candidate_ids: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              uniqueItems: true,
              items: { type: "string", pattern: "^[a-f0-9]{64}$" },
            },
            preferred_candidate_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
            verdict: { type: "string", enum: ["same_event"] },
            reason: { type: "string", minLength: 1, maxLength: 2000, pattern: "\\S" },
            evidence: {
              type: "array",
              minItems: 2,
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["candidate_id", "material_id", "block_id", "quote"],
                properties: {
                  candidate_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
                  material_id: { type: "string", minLength: 1 },
                  block_id: { type: "string", minLength: 1 },
                  quote: { type: "string", minLength: 8, maxLength: 4000 },
                },
              },
            },
          },
        },
      },
    },
  })
  if (review.pool_sha256 !== poolRef.sha256) throw Error("Identity review belongs to another pool")
  const used = new Set()
  for (const pair of review.pairs) {
    if (
      !pair.candidate_ids.includes(pair.preferred_candidate_id) ||
      pair.candidate_ids.some((id) => used.has(id))
    )
      throw Error("Distinct reviewed identity pairs and an exact preferred candidate are required")
    const candidates = pair.candidate_ids.map((id) =>
      pool.candidates.find((c) => c.candidate_id === id),
    )
    if (candidates.some((c) => !c)) throw Error("Identity review is outside the frozen pool")
    for (const candidate of candidates) {
      used.add(candidate.candidate_id)
      const citations = pair.evidence.filter((e) => e.candidate_id === candidate.candidate_id)
      if (!citations.length) throw Error("Identity review must cite each candidate")
      // Identity citations are checked against the frozen event's original
      // blocks; constructing the model packet also reads mutable history.
      const plan = checkedPlan(ctx, candidate.origin_plan, candidate.group_id)
      const event = plan.events.find((entry) => entry.group_id === candidate.group_id)
      const sources = sourcePacket(ctx, plan, event)
      for (const cite of citations) {
        const block = sources
          .find((s) => s.material_id === cite.material_id)
          ?.blocks.find((b) => b.block_id === cite.block_id)
        if (!block || !block.text.includes(cite.quote))
          throw Error("Identity review evidence is outside the exact original block")
      }
      assertReviewDate(review.reviewed_at, {
        notBefore: candidate.sources.map((s) => s.published_at),
      })
    }
    if (pair.evidence.some((e) => !pair.candidate_ids.includes(e.candidate_id)))
      throw Error("Identity review citation has an unrelated candidate")
  }
  return review
}

function assertCurationInputBoundary() {
  try {
    assertVerifiedInputBoundary()
  } catch (error) {
    if (!error.code) error.code = "CURATION_INPUT_CHANGED"
    error.curation_input_boundary = true
    throw error
  }
}

// A model proposes ratings; an explicit curator review records the decision.
export async function evaluateCuration(ctx, p, options = {}) {
  return withVerifiedInputSession(ctx, () => evaluateCurationNative(ctx, p, options))
}
async function evaluateCurationNative(ctx, p, { baseProvider } = {}) {
  const poolRef = { path: p.pool_path, sha256: p.pool_sha256 }
  const pool = memoizeVerifiedInput(
    ctx,
    "curation-evaluation-pool:" + JSON.stringify(poolRef),
    () => loadCurationPool(ctx, poolRef),
  )
  if (Boolean(p.review_file) === Boolean(p.execute))
    throw Error("Choose explicit curation review or model proposal execution")
  const rows = p.candidate_ids
    ? pool.candidates.filter((c) => p.candidate_ids.includes(c.candidate_id))
    : pool.candidates
  if (
    p.candidate_ids &&
    (new Set(p.candidate_ids).size !== p.candidate_ids.length ||
      rows.length !== p.candidate_ids.length)
  )
    throw Error("Exact distinct curation candidates required")
  const evaluations = [],
    failures = []
  if (p.review_file) {
    const review = JSON.parse(fs.readFileSync(safePath(ctx.repo, p.review_file)))
    if (
      review.schema !== "research-curation-review/v1" ||
      review.pool_sha256 !== poolRef.sha256 ||
      !review.reviewer?.trim() ||
      !Array.isArray(review.evaluations) ||
      new Set(review.evaluations.map((e) => e.candidate_id)).size !== review.evaluations.length
    )
      throw Error("Exact source-bound curation review required")
    assertReviewDate(review.reviewed_at)
    for (const evaluation of review.evaluations) {
      const candidate = rows.find((c) => c.candidate_id === evaluation.candidate_id)
      if (!candidate) throw Error("Curation review is outside the frozen pool")
      validateEvaluation(evaluation, candidate, ctx)
      assertReviewDate(review.reviewed_at, {
        notBefore: candidate.sources.map((s) => s.published_at),
      })
      const record = {
        schema: "research-curation-evaluation/v1",
        fingerprint: evaluationKey(pool, candidate),
        status: "reviewed",
        reviewer: review.reviewer,
        reviewed_at: review.reviewed_at,
        evaluation,
      }
      assertCurationInputBoundary()
      const ref = immutable(
        ctx.root,
        `curation/evaluations/${record.fingerprint}/${sha256(JSON.stringify(record))}.json`,
        record,
      )
      atomicWrite(ctx.root, evaluationPath(pool, candidate), { reference: ref })
      evaluations.push({ candidate_id: candidate.candidate_id, ...ref, status: "reviewed" })
    }
  } else {
    const policy = JSON.parse(fs.readFileSync(ctx.policy)),
      settings = resolveRolePolicy(policy, "search_plan")
    const window = createModelExecutionWindow({
      time_budget_ms: p.time_budget_ms ?? 600000,
      max_model_calls: p.max_model_calls ?? 4,
    })
    for (const candidate of rows) {
      const previous = reviewedEvaluation(ctx, pool, candidate)
      if (
        previous &&
        (previous.record.evaluation.valid_until === null ||
          previous.record.evaluation.valid_until >= pool.input.briefing_date)
      ) {
        evaluations.push({
          candidate_id: candidate.candidate_id,
          ...previous.reference,
          status: "reviewed",
          reused: true,
        })
        continue
      }
      const run =
        "cur-score-" + sha256(JSON.stringify([evaluationKey(pool, candidate), policy])).slice(0, 40)
      try {
        const model = await prepareRoleProvider(
          baseProvider || createModelProvider(policy, "search_plan", { root: ctx.root, run }),
          policy,
          "search_plan",
          { root: ctx.root, run, executionWindow: window, retryFailed: p.retry_failed === true },
        )
        const packet = curationCandidatePacket(ctx, candidate, { forModel: true })
        assertCurationInputBoundary()
        const result = await model.structured({
          model: settings.model,
          schema: curationEvaluationSchema,
          messages: [
            {
              role: "system",
              content:
                "Propose private editorial curation ratings, never approve facts or articles. Compare ORIGINAL event blocks with related previous articles. Check source support, scope, new information, current validity, and history comparison. Rate novelty/impact/specificity/knowledge_value/timeliness 0..5 with concrete reasons. Timeliness is current utility or urgency, NEVER a bonus for being published today. Preserve dates, plans versus execution, company attribution, numeric conditions. Cite exact original material/block/quote for the assessment. List every supplied previous article ID. Do not infer impact, customers, achievements or novelty from headline, company fame, frequency or common keywords. When source support exists, include composition organizations named in exact quotes, specific topics, and concise information_units preserving action, status and conditions, each with exact material_id/block_id/quote evidence. Equivalent information units use the same precise statement; shared company or topic does not mean the same event. If the current source and a supplied verified previous article suggest a followup, correction, contradiction, or change from planned to completed, optionally report only those as relation_candidates with status unreviewed, exact previous article ID and quote, and exact current material/block/quote. These are leads for later source comparison, not established event relationships; never infer one from shared names or keywords. Do not use an unverified previous article as a relation candidate. Use false when a required check cannot be supported; null validity date unless an explicit deadline applies. Output is an UNREVIEWED proposal.",
            },
            {
              role: "user",
              content: JSON.stringify(packet),
            },
          ],
        })
        assertCurationInputBoundary()
        validateEvaluation(result.output, candidate, ctx)
        const ref = immutable(ctx.root, `curation/proposals/${run}.json`, {
          schema: "research-curation-proposal/v1",
          fingerprint: evaluationKey(pool, candidate),
          evaluation: result.output,
          status: "unreviewed",
          model_run: run,
        })
        evaluations.push({ candidate_id: candidate.candidate_id, ...ref, status: "unreviewed" })
      } catch (error) {
        if (error.code === "REASONING_PENDING" || error.curation_input_boundary) throw error
        failures.push({
          candidate_id: candidate.candidate_id,
          error: error.message,
          code: error.code || null,
        })
        if (["MODEL_CALL_LIMIT", "MODEL_TIME_BUDGET_EXCEEDED"].includes(error.code)) break
      }
    }
  }
  const result = {
    schema: "research-curation-evaluations/v1",
    pool: poolRef,
    status: failures.length
      ? "partial"
      : evaluations.some((e) => e.status === "unreviewed")
        ? "curation_review"
        : "complete",
    evaluations,
    rows: evaluations
      .filter((e) => e.status === "unreviewed")
      .map((e) => ({
        candidate_id: e.candidate_id,
        status: "curation_review",
        proposal: { path: e.path, sha256: e.sha256 },
      })),
    failures,
    candidate_approved: false,
    candidate_published: false,
  }
  assertCurationInputBoundary()
  atomicWrite(ctx.root, `curation/runs/${pool.run_id}/evaluations.json`, result)
  return result
}
export async function selectCuration(ctx, p) {
  const poolRef = { path: p.pool_path, sha256: p.pool_sha256 }
  const snapshot = pinned(ctx.root, poolRef)
  if (snapshot.schema !== "research-curation-pool/v1" || !Array.isArray(snapshot.candidates))
    throw Error("Native curation pool required")
  // Unreviewed candidates remain held. Their immutable pool entry is retained,
  // but their source bodies need not be reopened until they receive a review.
  const evaluations = new Map(snapshot.candidates.map((candidate) => [
    candidate.candidate_id, reviewedEvaluation(ctx, snapshot, candidate),
  ]))
  const reviewedIds = snapshot.candidates.filter((candidate) =>
    evaluations.get(candidate.candidate_id)?.record?.status === "reviewed"
  ).map((candidate) => candidate.candidate_id)
  const pool = loadCurationPool(ctx, poolRef, { candidateIds: reviewedIds })
  const pathName = `curation/runs/${pool.run_id}/selection.json`
  const old = readJSON(ctx.root, pathName)
  if (old) {
    loadCurationSelection(ctx, reference(ctx.root, pathName))
    if (p.identity_review_file) {
      const supplied = JSON.parse(fs.readFileSync(safePath(ctx.repo, p.identity_review_file)))
      if (!old.identity_review || !same(pinned(ctx.root, old.identity_review), supplied))
        throw Error("Curation identity review changed; use a new selection")
    }
    return { ...reference(ctx.root, pathName), selected: old.selected.length, reused: true }
  }
  let identityReview = null,
    identityReviewRef = null
  if (p.identity_review_file) {
    identityReview = checkedIdentityReview(
      ctx,
      poolRef,
      pool,
      JSON.parse(fs.readFileSync(safePath(ctx.repo, p.identity_review_file))),
    )
    identityReviewRef = immutable(
      ctx.root,
      `curation/runs/${pool.run_id}/identity-review.json`,
      identityReview,
    )
  }
  const ranked = [],
    held = [],
    profiles = new Map()
  for (const candidate of pool.candidates) {
    const reviewed = evaluations.get(candidate.candidate_id)
    const record = reviewed?.record
    if (!record || record.status !== "reviewed") {
      held.push({ candidate_id: candidate.candidate_id, reason: "curator_review_required" })
      continue
    }
    if (record.fingerprint !== evaluationKey(pool, candidate))
      throw Error("Curation score binding changed")
    const rating = validateEvaluation(record.evaluation, candidate, ctx)
    if (rating.composition) profiles.set(candidate.candidate_id, rating.composition)
    const score = CURATION_METRICS.reduce(
      (sum, metric) => sum + (pool.policy.weights[metric] * rating.ratings[metric].value) / 5,
      0,
    )
    const eligible =
      checks.every((k) => rating.checks[k]) &&
      rating.ratings.novelty.value > 0 &&
      !candidate.already_featured &&
      (rating.valid_until === null || rating.valid_until >= pool.input.briefing_date)
    const item = {
      candidate_id: candidate.candidate_id,
      score,
      priority: score >= pool.policy.priority_score ? "high" : "normal",
      sector: rating.sector,
      evaluation: reviewed.reference,
      source_published_at: candidate.source_published_at,
      briefing_date: pool.input.briefing_date,
      origin_plan: candidate.origin_plan,
      group_id: candidate.group_id,
      action: candidate.action,
      execution: candidate.execution,
    }
    if (!eligible || score < pool.policy.minimum_score)
      held.push({
        ...item,
        reason: !eligible ? "ineligible_or_no_new_information" : "below_threshold",
      })
    else ranked.push(item)
  }
  for (const pair of identityReview?.pairs || []) {
    const preferred = ranked.find((item) => item.candidate_id === pair.preferred_candidate_id)
    const alternateId = pair.candidate_ids.find((id) => id !== pair.preferred_candidate_id)
    const index = ranked.findIndex((item) => item.candidate_id === alternateId)
    if (preferred && index >= 0) {
      const [alternate] = ranked.splice(index, 1)
      held.push({
        ...alternate,
        reason: "reviewed_same_event",
        preferred_candidate_id: pair.preferred_candidate_id,
      })
    }
  }
  const composed = selectBriefingComposition(
    ranked,
    pool.candidates,
    profiles,
    readBriefingCompositionPolicy(ctx),
    { max_articles: pool.input.max_articles, max_per_sector: pool.policy.max_per_sector },
  )
  const selected = composed.selected
  held.push(...composed.held)
  const batches = []
  let previouslyApprovedRuns
  for (const item of selected) {
    if (item.action === "defer") {
      const original = checkedPlan(ctx, item.origin_plan)
      const raw = pinned(ctx.root, original.review).events.find((e) => e.group_id === item.group_id)
      const plannedEvent = original.events.find((e) => e.group_id === item.group_id)
      const review = pinned(ctx.root, item.evaluation)
      const relative = `curation/runs/${pool.run_id}/promotions/${item.candidate_id}.json`
      if (!raw || !plannedEvent) throw Error("Curated defer event is missing its exact native plan")
      const promotedEvent = { ...plannedEvent, action: "write" }
      const input = {
        schema: "research-event-decisions/v1",
        reviewer: review.reviewer,
        reviewed_at: review.reviewed_at,
        events: [
          {
            ...raw,
            action: "write",
            reason: "Curation source/history review: " + review.evaluation.ratings.novelty.reason,
          },
        ],
      }
      immutable(ctx.root, relative, input)
      const workKey = eventWorkKey(promotedEvent)
      const binding = eventWriterBinding(ctx, item.origin_plan, promotedEvent, {
        globalOnly: true,
        useRecoveryScope: false,
      })
      if (binding) {
        const prior = loadSelectedEvent(
          ctx,
          {
            run_id: binding.writer_run,
            selection_path: binding.selection.path,
            selection_sha256: binding.selection.sha256,
          },
          { requireProcessed: true },
        )
        const priorPlan = checkedPlan(ctx, prior.plan, prior.group_id)
        const priorEvent = priorPlan.events.find((event) => event.group_id === prior.group_id)
        if (
          !priorEvent ||
          prior.action !== "write" ||
          eventWorkKey(priorEvent) !== workKey ||
          JSON.stringify(priorEvent.sources) !== JSON.stringify(promotedEvent.sources) ||
          JSON.stringify(priorEvent.identity) !== JSON.stringify(promotedEvent.identity) ||
          JSON.stringify(priorEvent.prior) !== JSON.stringify(promotedEvent.prior)
        )
          throw Error("Existing curated promotion writer differs from the exact reviewed event")

        // An unfinished writer keeps its original checkpoint; only an actual
        // approval is eligible for reuse as an approved article.
        if (fs.existsSync(safePath(ctx.root, `runs/${binding.writer_run}/approved-article.json`))) {
          const { loadCurrentApproval } = await import("./preview.mjs")
          const approval = loadCurrentApproval(ctx.root, binding.writer_run, { vault: ctx.vault })
          const expectedUrls = new Set(prior.sources.map((source) => canonicalURL(source.url)))
          const approvedUrls = (approval.article.source_urls || []).map(canonicalURL)
          const primary = sourcePacket(ctx, priorPlan, priorEvent, false).find(
            (source) => source.role === "primary",
          )
          const articleReview = approval.article.article_review
          const matchingDate =
            samePublicationDate(articleReview?.published_at, primary?.published_at) ||
            (articleReview?.date_kind === "source-publication-time" &&
              samePublicationDate(articleReview.source_published_at, primary?.published_at) &&
              articleReview.published_at === seoulPublicationDay(primary?.published_at))
          if (
            !approvedUrls.length ||
            approvedUrls.some((url) => !expectedUrls.has(url)) ||
            !matchingDate
          )
            throw Error("Existing curated promotion approval differs from its exact sources or date")
        } else {
          // A persisted candidate approval cannot be reinterpreted as an
          // unfinished writer merely because its approved article is missing.
          if (!previouslyApprovedRuns) {
            const backlog = readBacklog(ctx.backlog || pool.context.backlog)
            if (!backlog) throw Error("Stored candidate backlog required")
            previouslyApprovedRuns = new Set(backlog.candidates.map((row) => row.approval?.approved_run).filter(Boolean))
          }
          if (previouslyApprovedRuns.has(binding.writer_run))
            throw Error("Existing curated promotion approved article is missing")
        }
        item.execution = { plan: prior.plan, group_id: prior.group_id }
      } else {
        const promoted = await reviewEditionEvents(ctx, {
          run_id:
            "cur-promote-" + sha256(JSON.stringify([poolRef, item.candidate_id])).slice(0, 40),
          edition_path: original.edition.path,
          edition_sha256: original.edition.sha256,
          review_file: path.relative(ctx.repo, safePath(ctx.root, relative)),
        })
        item.execution = {
          plan: { path: promoted.path, sha256: promoted.sha256 },
          group_id: item.group_id,
        }
      }
    }
    let batch = batches.find((b) => same(b.plan, item.execution.plan))
    if (!batch) {
      batch = { plan: item.execution.plan, group_ids: [] }
      batches.push(batch)
    }
    batch.group_ids.push(item.execution.group_id)
  }
  const result = {
    schema: "research-curation-selection/v1",
    run_id: pool.run_id,
    pool: poolRef,
    briefing_date: pool.input.briefing_date,
    selected,
    held,
    batches,
    composition: composed.composition,
    ...(identityReviewRef ? { identity_review: identityReviewRef } : {}),
    candidate_approved: false,
    candidate_published: false,
    first_featured_marked: false,
  }
  const ref = immutable(ctx.root, pathName, result)
  return { ...ref, selected: selected.length, held: held.length, reused: false }
}
export function loadCurationSelection(ctx, ref, options = {}) {
  return memoizeVerifiedInput(ctx, "curation-selection:" + JSON.stringify([ref, options]), () =>
    loadCurationSelectionUncached(ctx, ref, options),
  )
}
function loadCurationSelectionUncached(ctx, ref, options = {}) {
  const selection = pinned(ctx.root, ref)
  if (
    selection.schema !== "research-curation-selection/v1" ||
    ref.path !== `curation/runs/${selection.run_id}/selection.json`
  )
    throw Error("Native curation selection required")
  // A frozen selection only publishes these candidates. Other queued sources
  // remain bound by the pool SHA; reopening their raw bodies on every read
  // would turn an unrelated cold payload into a publication dependency.
  const pool = loadCurationPool(ctx, selection.pool, {
    ...options,
    candidateIds: selection.selected.map((item) => item.candidate_id),
  })
  if (selection.identity_review) {
    if (selection.identity_review.path !== `curation/runs/${selection.run_id}/identity-review.json`)
      throw Error("Curation identity review path changed")
    const review = checkedIdentityReview(
      ctx,
      selection.pool,
      pool,
      pinned(ctx.root, selection.identity_review),
    )
    for (const pair of review.pairs) {
      if (
        pair.candidate_ids.filter((id) =>
          selection.selected.some((item) => item.candidate_id === id),
        ).length > 1
      )
        throw Error("Reviewed same event appears more than once")
    }
    for (const item of selection.held.filter((row) => row.reason === "reviewed_same_event"))
      if (
        !review.pairs.some(
          (pair) =>
            pair.candidate_ids.includes(item.candidate_id) &&
            pair.preferred_candidate_id === item.preferred_candidate_id &&
            item.candidate_id !== pair.preferred_candidate_id,
        )
      )
        throw Error("Curation duplicate hold differs from its reviewed identity")
  } else if (selection.held.some((item) => item.reason === "reviewed_same_event"))
    throw Error("Curation duplicate hold requires a pinned identity review")
  if (selection.composition) {
    const composition = selection.composition
    if (
      composition.schema !== "research-briefing-composition/v1" ||
      composition.importance_scores_changed !== false ||
      composition.public_analysis_created !== false ||
      !same(
        composition.decisions.map((row) => [row.candidate_id, row.score]),
        selection.selected.map((row) => [row.candidate_id, row.score]),
      )
    )
      throw Error("Briefing composition differs from its selected events")
    if (
      options.checkHistory !== false &&
      !same(
        composition.policy,
        readBriefingCompositionPolicy({ ...ctx, repo: ctx.repo || pool.context.repo }),
      )
    )
      throw Error("Briefing composition policy changed; prepare a new selection")
  }
  if (selection.selected.length > pool.input.max_articles)
    throw Error("Curation article budget changed")
  const identities = new Set(),
    counts = new Map()
  for (const item of selection.selected) {
    const candidate = pool.candidates.find((c) => c.candidate_id === item.candidate_id)
    if (!candidate || identities.has(candidate.identity_key))
      throw Error("Duplicate or unknown curated event")
    identities.add(candidate.identity_key)
    const record = pinned(ctx.root, item.evaluation)
    if (record.status !== "reviewed" || record.fingerprint !== evaluationKey(pool, candidate))
      throw Error("Unreviewed or stale curation decision")
    const rating = validateEvaluation(record.evaluation, candidate, ctx)
    const score = CURATION_METRICS.reduce(
      (sum, metric) => sum + (pool.policy.weights[metric] * rating.ratings[metric].value) / 5,
      0,
    )
    if (
      score !== item.score ||
      rating.sector !== item.sector ||
      !checks.every((k) => rating.checks[k]) ||
      rating.ratings.novelty.value === 0 ||
      candidate.already_featured ||
      score < pool.policy.minimum_score ||
      (rating.valid_until !== null && rating.valid_until < pool.input.briefing_date)
    )
      throw Error("Curation eligibility or score changed")
    counts.set(item.sector, (counts.get(item.sector) || 0) + 1)
    if (counts.get(item.sector) > pool.policy.max_per_sector)
      throw Error("Curation sector budget changed")
    const executionEvent = checkedPlan(
      ctx,
      item.execution.plan,
      item.execution.group_id,
    ).events.find((e) => e.group_id === item.execution.group_id)
    const origin = checkedPlan(ctx, candidate.origin_plan, candidate.group_id).events.find(
      (e) => e.group_id === candidate.group_id,
    )
    if (
      eventWorkKey(executionEvent) !==
      eventWorkKey({ ...origin, action: origin.action === "defer" ? "write" : origin.action })
    )
      throw Error("Curated execution differs from the reviewed source event")
    if (
      item.source_published_at !== candidate.source_published_at ||
      item.briefing_date !== pool.input.briefing_date
    )
      throw Error("Curation cannot change the original publication date")
  }
  const expected = selection.selected.map((i) => [i.execution.plan, i.execution.group_id])
  const actual = selection.batches.flatMap((b) => b.group_ids.map((g) => [b.plan, g]))
  if (
    !same(
      expected.map((v) => JSON.stringify(v)).sort(),
      actual.map((v) => JSON.stringify(v)).sort(),
    )
  )
    throw Error("Curation execution groups changed")
  return selection
}
export function curationGroupsForPlan(ctx, ref, planRef, options = {}) {
  const selection = loadCurationSelection(ctx, ref, options)
  const batch = selection.batches.find((b) => same(b.plan, planRef))
  return batch?.group_ids || []
}

// A missing parent row alone never proves that its writer has not started.
// Only a caller that checked the exact native bindings may mark an unrecorded
// batch as an unstarted candidate.
export function completeCurationFrontier(
  selection,
  rows,
  startedPlans,
  { unstartedCandidates = [] } = {},
) {
  const selected = new Set(selection.selected.map((item) => item.candidate_id))
  const executions = new Set(
    selection.selected.map((item) =>
      JSON.stringify([item.execution.plan, item.execution.group_id]),
    ),
  )
  if (selected.size !== selection.selected.length || executions.size !== selection.selected.length)
    throw Error("Curation selection contains duplicate candidate or execution identities")
  const seen = new Set()
  for (const row of rows) {
    if (!selected.has(row.candidate_id) || seen.has(row.candidate_id))
      throw Error("Curation frontier contains an unknown or duplicate selected candidate")
    seen.add(row.candidate_id)
  }
  const started = new Set(startedPlans.map((plan) => JSON.stringify(plan)))
  const unstarted = new Set(unstartedCandidates)
  return [
    ...rows,
    ...selection.selected
      .filter((item) => !seen.has(item.candidate_id))
      .map((item) => {
        const exists = started.has(JSON.stringify(item.execution.plan))
        return {
          candidate_id: item.candidate_id,
          group_id: item.execution.group_id,
          origin_plan: item.execution.plan,
          status: !exists && unstarted.has(item.candidate_id) ? "queued" : "frontier_inconsistent",
          queue_reason: exists ? "checkpoint_row_absent" : "batch_not_in_checkpoint",
        }
      }),
  ]
}
