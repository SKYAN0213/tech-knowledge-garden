import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { Ollama, localOllamaURL } from "./ollama.mjs"
import { resolveRolePolicy } from "./model-policy.mjs"

const pattern = /^reasoning-[a-f0-9]{64}$/
const base = (id) => {
  if (!pattern.test(id || "")) throw Error("Exact reasoning task ID required")
  return `reasoning-tasks/${id}/`
}
const bounded = (value) => {
  const encoded = JSON.stringify(value)
  if (!encoded || Buffer.byteLength(encoded) > 2 * 1048576)
    throw Error("Reasoning input/output exceeds two MiB")
  return JSON.parse(encoded)
}
function load(root, id, expected) {
  const request = readJSON(root, base(id) + "request.json")
  if (!request || request.schema !== "research-reasoning-request/v1")
    throw Error("Stored reasoning request required")
  const { request_sha256, task_id, ...body } = request
  if (
    task_id !== id ||
    id !== "reasoning-" + sha256(JSON.stringify(body)) ||
    request_sha256 !== sha256(JSON.stringify(body)) ||
    (expected !== undefined && expected !== request_sha256)
  )
    throw Error("Reasoning request hash changed")
  return request
}
function completed(root, request) {
  const stored = readJSON(root, base(request.task_id) + "result.json")
  if (!stored) return null
  const { result_sha256, ...result } = stored
  if (
    result.request_sha256 !== request.request_sha256 ||
    result.task_id !== request.task_id ||
    result_sha256 !== sha256(JSON.stringify(result))
  )
    throw Error("Reasoning result binding changed")
  assertSchema(result.output, request.input.schema)
  assertExecutorModel(request, result)
  return stored
}
function assertExecutorModel(request, { executor, model }) {
  const requested = request.binding.settings?.model
  // Legacy generic Codex requests and explicit local handoffs keep their
  // original contract. Named Codex requests require that exact executor model.
  if (executor === "codex" && requested && requested !== "codex" && model !== requested)
    throw Error("Reasoning executor model must match requested model: " + requested)
}
function assertArticleSemanticProposalBinding(request, output) {
  const proposalSchemas = request.input?.schema?.properties?.schema?.enum || []
  if (
    request.role !== "evidence_compare" ||
    !proposalSchemas.includes("article-semantic-proposal/v2")
  )
    return

  const context = request.input?.context,
    article = context?.article,
    claims = context?.verified_public_claims,
    concepts = context?.reviewed_concept_registry
  if (
    !/^[a-f0-9]{16}$/.test(article?.event_id || "") ||
    !Array.isArray(claims) ||
    !Array.isArray(concepts)
  )
    throw Error("Bound semantic article, claim and concept context required")
  if (output.event_id !== article.event_id)
    throw Error("Semantic result event ID does not match its bound article")

  const claimIds = new Set(claims.map((claim) => claim?.claim_id)),
    conceptIds = new Set(concepts.map((concept) => concept?.concept_id)),
    relations = [...output.links, ...output.relation_candidates],
    seenConcepts = new Set()
  if (
    claimIds.size !== claims.length ||
    [...claimIds].some((id) => typeof id !== "string" || !id) ||
    conceptIds.size !== concepts.length ||
    [...conceptIds].some((id) => typeof id !== "string" || !id)
  )
    throw Error("Distinct bound semantic claim and concept IDs required")
  if (
    (output.outcome === "reviewed_none" && output.links.length > 0) ||
    (output.outcome === "reviewed_links" && output.links.length === 0)
  )
    throw Error("Semantic review outcome does not match its confirmed links")

  const assertClaimReferences = (claimReferences) => {
    if (new Set(claimReferences).size !== claimReferences.length)
      throw Error("Semantic result repeats an evidence claim")
    for (const claimId of claimReferences) {
      if (!claimIds.has(claimId))
        throw Error("Semantic result cites a claim outside its bound public article")
    }
  }
  for (const relation of relations) {
    if (!conceptIds.has(relation.concept_id))
      throw Error("Semantic result cites a concept outside its bound registry")
    if (seenConcepts.has(relation.concept_id))
      throw Error("Semantic result repeats a concept across links and candidates")
    seenConcepts.add(relation.concept_id)
    assertClaimReferences(relation.evidence_claim_ids)
  }
  for (const candidate of output.concept_candidates)
    assertClaimReferences(candidate.evidence_claim_ids)
  const keywordCandidates = new Set()
  for (const candidate of output.keyword_candidates) {
    const key = candidate.keyword.normalize("NFKC").toLocaleLowerCase("en").trim()
    if (keywordCandidates.has(key))
      throw Error("Semantic result repeats an article keyword candidate")
    keywordCandidates.add(key)
    assertClaimReferences(candidate.evidence_claim_ids)
  }
}
export class ReasoningPending extends Error {
  constructor(request) {
    super("Reasoning result required: " + request.task_id)
    this.code = "REASONING_PENDING"
    this.reasoning_task = { task_id: request.task_id, request_sha256: request.request_sha256 }
  }
}
export function createReasoningTask(root, { run, role, binding, input }) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "") || !role || !binding)
    throw Error("Bound run, role and model policy required")
  const body = bounded({ schema: "research-reasoning-request/v1", run, role, binding, input })
  const request_sha256 = sha256(JSON.stringify(body)),
    task_id = "reasoning-" + request_sha256
  const request = { ...body, task_id, request_sha256 }
  const prior = readJSON(root, base(task_id) + "request.json")
  if (prior) load(root, task_id, request_sha256)
  else atomicCreate(root, base(task_id) + "request.json", request)
  return request
}
export function reasoningTasks(root, { offset = 0, limit = 40, run_id } = {}) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("Bounded reasoning task page required")
  const directory = safePath(root, "reasoning-tasks")
  const tasks = (fs.existsSync(directory) ? fs.readdirSync(directory) : [])
    .filter((id) => pattern.test(id))
    .sort()
    .map((id) => load(root, id))
    .filter((r) => !run_id || r.run === run_id)
    .filter((r) => !completed(root, r))
    .map(({ task_id, request_sha256, run, role, binding }) => ({
      task_id,
      request_sha256,
      run,
      role,
      requested_model: binding.settings?.model ?? null,
      requested_thinking: binding.settings?.think ?? null,
    }))
  return {
    status: "reasoning_pending",
    tasks: tasks.slice(offset, offset + limit),
    total: tasks.length,
    next_offset: offset + limit < tasks.length ? offset + limit : null,
  }
}
export function readReasoningTask(root, { task_id, request_sha256, offset = 0, limit = 16000 }) {
  const request = load(root, task_id, request_sha256)
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 64000
  )
    throw Error("Bounded reasoning request page required")
  const content = JSON.stringify(request),
    next = Math.min(content.length, offset + limit)
  if (offset > content.length) throw Error("Reasoning offset exceeds request")
  const result = completed(root, request)
  return {
    task_id,
    request_sha256: request.request_sha256,
    status: result ? "completed" : "reasoning_pending",
    requested_model: request.binding.settings?.model ?? null,
    requested_thinking: request.binding.settings?.think ?? null,
    ...(result
      ? {
          result: {
            path: base(task_id) + "result.json",
            executor: result.executor,
            model: result.model,
            result_sha256: result.result_sha256,
          },
        }
      : {}),
    chunk: content.slice(offset, next),
    offset,
    next_offset: next < content.length ? next : null,
    total_characters: content.length,
  }
}
export async function submitReasoningResult(root, parameters) {
  const { task_id, request_sha256, output, executor, model = null } = parameters
  if (!["codex", "ollama"].includes(executor)) throw Error("Explicit reasoning executor required")
  return withLock(root, task_id, async () => {
    const request = load(root, task_id, request_sha256),
      value = bounded(output)
    assertSchema(value, request.input.schema)
    assertArticleSemanticProposalBinding(request, value)
    assertExecutorModel(request, { executor, model })
    const prior = completed(root, request)
    if (prior) {
      if (JSON.stringify(prior.output) !== JSON.stringify(value))
        throw Error("Reasoning result is immutable; submit a new bound request")
      return { status: "completed", task_id, reused: true, public_approved: false }
    }
    const result = {
      schema: "research-reasoning-result/v1",
      task_id,
      request_sha256,
      output: value,
      executor,
      model,
      submitted_at: new Date().toISOString(),
      attribution: "caller_declared",
      public_approved: false,
    }
    atomicCreate(root, base(task_id) + "result.json", {
      ...result,
      result_sha256: sha256(JSON.stringify(result)),
    })
    return { status: "completed", task_id, reused: false, public_approved: false }
  })
}
export async function executeReasoningTask(ctx, parameters, { provider } = {}) {
  const request = load(ctx.root, parameters.task_id, parameters.request_sha256)
  const prior = completed(ctx.root, request)
  if (prior) return { status: "completed", task_id: request.task_id, reused: true, model_calls: 0 }
  return withLock(ctx.root, "execute-" + request.task_id, async () => {
    const current = completed(ctx.root, request)
    if (current)
      return { status: "completed", task_id: request.task_id, reused: true, model_calls: 0 }
    const policy = JSON.parse(fs.readFileSync(ctx.policy, "utf8"))
    const requestedRole = resolveRolePolicy(policy, request.role)
    const localPolicy =
      requestedRole.provider === "ollama"
        ? policy
        : JSON.parse(fs.readFileSync(safePath(ctx.repo, "data/research-model-policy.json"), "utf8"))
    const localRole = resolveRolePolicy(localPolicy, request.role)
    if (!parameters.model && localRole.provider !== "ollama")
      throw Error("Local Ollama role policy or an explicit installed model required")
    const local =
      provider ||
      new Ollama({
        url: policy.runtime?.ollama_url || localPolicy.runtime?.ollama_url || localOllamaURL(),
      })
    const model = parameters.model || localRole.model
    const roleThinking = localRole.provider === "ollama" && model === localRole.model
    const response = await local.structured({
      ...request.input,
      model,
      // The source/schema remain frozen; reasoning levels belong to the actual
      // local model. Gemma uses booleans where Qwen/Codex can use "medium".
      think: roleThinking ? localRole.think : request.input.think,
      timeout_ms: request.binding.settings.call_timeout_ms,
    })
    const result = await submitReasoningResult(ctx.root, {
      ...parameters,
      output: response.output,
      executor: "ollama",
      model,
    })
    // The actual local response remains separate from the requested Codex binding.
    const file = base(request.task_id) + "local-execution.json"
    if (!readJSON(ctx.root, file))
      atomicCreate(
        ctx.root,
        file,
        bounded({
          ...response,
          local_execution_policy: {
            role: request.role,
            policy_sha256: sha256(JSON.stringify(localPolicy)),
            configured_model: localRole.model,
            configured_think: localRole.think,
            role_thinking_applied: roleThinking,
          },
        }),
      )
    return { ...result, model_calls: 1 }
  })
}

// An external executor receives the same source-bound prompt/schema as Ollama.
// No API key, model checkpoint or factual approval is manufactured here.
export class DelegatedReasoning {
  constructor({ root, run, role, settings }) {
    Object.assign(this, { root, run, role, settings })
  }
  async metadata(model) {
    if (model !== this.settings.model) throw Error("Delegated model policy changed")
    return {
      model,
      digest: sha256(JSON.stringify({ provider: "codex", model })),
      runtime: "external-codex-result/v1",
      capabilities: ["completion"],
      thinking: { values: [this.settings.think] },
    }
  }
  request(input) {
    const { on_progress, timeout_ms, ...content } = input
    return createReasoningTask(this.root, {
      run: this.run,
      role: this.role,
      binding: this.executionPolicy,
      input: content,
    })
  }
  async prepareStructured(input) {
    const request = this.request(input)
    if (!completed(this.root, request)) throw new ReasoningPending(request)
  }
  async structured(input) {
    const request = this.request(input),
      result = completed(this.root, request)
    if (!result) throw new ReasoningPending(request)
    const transportRequest = {
      model: input.model,
      think: input.think,
      messages: input.messages,
      format: input.schema,
      stream: false,
      options: {
        num_ctx: input.num_ctx,
        num_predict: input.num_predict,
        temperature: input.temperature,
      },
    }
    const content = JSON.stringify(result.output)
    return {
      output: result.output,
      artifacts: {
        request: transportRequest,
        request_sha256: sha256(JSON.stringify(transportRequest)),
        response_content: content,
        response_content_sha256: sha256(content),
        done: true,
        done_reason: "stop",
      },
      provenance: {
        ...(await this.metadata(input.model)),
        provider: "delegated",
        executor: result.executor,
        executed_model: result.model,
        think: input.think,
        num_ctx: input.num_ctx,
        num_predict: input.num_predict,
        temperature: input.temperature,
        prompt_sha256: sha256(JSON.stringify(input.messages)),
        schema_sha256: sha256(JSON.stringify(input.schema)),
        task_id: request.task_id,
        request_sha256: request.request_sha256,
        result_sha256: result.result_sha256,
        public_approved: false,
      },
    }
  }
}
