import { assertSchema, sha256 } from "./contracts.mjs"
import { Agent } from "undici"

let localDispatcher
const sharedLocalDispatcher = () => (localDispatcher ??= new Agent())

export const DEFAULT_LOCAL_OLLAMA_URL = "http://127.0.0.1:11434"
export const DEFAULT_LOCAL_OLLAMA_MODEL = "gemma4:31b-mlx"
export const CODEX_STRUCTURED_CONTEXT_LIMIT = 131072

// This is an admission estimate, not a tokenizer measurement. Count the actual
// message/schema serialization and reserve output plus chat-template space.
// The local request also disables server truncation/context shifting; an
// underestimated token count must fail instead of dropping source conditions.
export function structuredRequestBudget(
  { messages, schema, num_ctx = 8192, num_predict = 4096 },
  { maxContextTokens = 32768 } = {},
) {
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.some((m) => typeof m?.role !== "string" || typeof m.content !== "string") ||
    !schema ||
    typeof schema !== "object" ||
    Array.isArray(schema) ||
    !Number.isInteger(num_ctx) ||
    num_ctx < 4096 ||
    num_ctx > maxContextTokens ||
    !Number.isInteger(maxContextTokens) ||
    maxContextTokens < 4096 ||
    maxContextTokens > CODEX_STRUCTURED_CONTEXT_LIMIT ||
    !Number.isInteger(num_predict) ||
    num_predict < 128 ||
    num_predict > 8192
  )
    throw Error("Actual structured messages, schema and bounded context/output required")
  const serialized = JSON.stringify({ messages, format: schema })
  const templateReserve = 256
  const available = num_ctx - num_predict - templateReserve
  return {
    schema: "structured-request-budget/v1",
    input_chars: serialized.length,
    input_utf8_bytes: Buffer.byteLength(serialized),
    messages_sha256: sha256(JSON.stringify(messages)),
    schema_sha256: sha256(JSON.stringify(schema)),
    estimated_input_tokens: Math.ceil(serialized.length / 2),
    tokenizer_verified: false,
    num_ctx,
    output_reserved_tokens: num_predict,
    template_reserved_tokens: templateReserve,
    input_char_limit: Math.max(0, available * 2),
    fits: available > 0 && serialized.length <= available * 2,
    source_truncation_allowed: false,
  }
}

export function assertStructuredRequestBudget(request, options) {
  const budget = structuredRequestBudget(request, options)
  if (!budget.fits) {
    const error = Error(
      "Actual prompt/schema exceeds context budget after output reserve; split explicitly",
    )
    error.code = "MODEL_INPUT_BUDGET_EXCEEDED"
    error.model_budget = { ...budget, request_sent: false, requires_explicit_resume: true }
    throw error
  }
  return budget
}

// DOMException.code is a read-only numeric getter. Preserve the native error
// and stream evidence in a writable wrapper instead of masking the timeout.
export function modelFailureWithCode(error, code) {
  const failure = new Error(error.message, { cause: error })
  Object.assign(failure, error)
  failure.name = error.name
  failure.code =
    code === "MODEL_ATTEMPT_FAILED" &&
    ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(error.cause?.code)
      ? "MODEL_CALL_TIMEOUT"
      : code
  failure.native_error = {
    name: error.name,
    code: error.code ?? null,
    message: error.message,
    ...(typeof error.cause?.message === "string"
      ? {
          cause: {
            name: error.cause.name,
            code: error.cause.code ?? null,
            message: error.cause.message,
          },
        }
      : {}),
  }
  return failure
}

export function validateLocalOllamaURL(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw Error("Ollama must use a local endpoint")
  }
  if (
    !/^https?:$/.test(parsed.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  )
    throw Error("Ollama must use a local endpoint")
  return url.replace(/\/$/, "")
}

export function localOllamaURL(env = process.env) {
  return validateLocalOllamaURL(env.TECH_KNOWLEDGE_OLLAMA_URL ?? DEFAULT_LOCAL_OLLAMA_URL)
}

// MLX runners can retain the soft limit from their first load even when a later
// request asks for a larger context. Observe the exact installed model; never
// unload a shared runner or treat a reported limit as a tested context window.
export function inspectOllamaLoadedContext(response, { model, digest, num_ctx }) {
  if (
    typeof model !== "string" ||
    !model.trim() ||
    !/^[a-f0-9]{64}$/.test(digest || "") ||
    !Number.isInteger(num_ctx) ||
    num_ctx < 4096 ||
    num_ctx > 32768
  )
    throw Error("Exact installed model and requested context required")
  if (!Array.isArray(response?.models) || response.models.length > 64)
    throw Error("Bounded native running-model response required for context observation")
  const matching = response.models.filter((row) => row.name === model || row.model === model)
  if (matching.length > 1) throw Error("Ambiguous loaded model context")
  const row = matching[0]
  if (row && row.digest !== digest) throw Error("Loaded context model digest changed")
  if (!row && response.models.some((other) => other.digest === digest))
    throw Error("Loaded digest uses another model identity; context cannot be attributed")
  if (row && (!Number.isSafeInteger(row.context_length) || row.context_length <= 0))
    throw Error("Loaded model context length must be explicitly reported")
  return {
    schema: "ollama-loaded-context-observation/v1",
    endpoint: "/api/ps",
    model,
    digest,
    requested_context_length: num_ctx,
    target_loaded: Boolean(row),
    other_loaded_models: response.models.length - matching.length,
    reported_context_length: row?.context_length ?? null,
    status: !row ? "not_loaded" : row.context_length < num_ctx ? "insufficient" : "sufficient",
    response_sha256: sha256(JSON.stringify(response)),
    target: row ? structuredClone(row) : null,
    full_context_window_verified: false,
  }
}

export class Ollama {
  constructor({
    url = DEFAULT_LOCAL_OLLAMA_URL,
    fetchImpl = fetch,
    dispatcher,
    timeout_ms = 300000,
    keep_alive = process.env.TKG_OLLAMA_KEEP_ALIVE || "5m",
  } = {}) {
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0 || timeout_ms > 3600000)
      throw Error("Invalid local model timeout")
    const lease = /^([1-9][0-9]*)(s|m)$/.exec(keep_alive)
    const leaseSeconds = lease ? Number(lease[1]) * (lease[2] === "m" ? 60 : 1) : NaN
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300)
      throw Error("Local model keep-alive must be a bounded idle lease from 1s to 5m")
    this.url = validateLocalOllamaURL(url)
    this.fetch = fetchImpl
    if (dispatcher !== undefined && typeof dispatcher?.dispatch !== "function")
      throw Error("Local model HTTP dispatcher required")
    this.dispatcher = dispatcher ?? (fetchImpl === fetch ? sharedLocalDispatcher() : null)
    this.timeout = timeout_ms
    this.keepAlive = keep_alive
  }
  transportOptions(timeout_ms) {
    return {
      signal: AbortSignal.timeout(timeout_ms),
      ...(this.dispatcher
        ? {
            // Node fetch otherwise ends a queued model request after its own
            // 300-second HTTP limit, before the explicit role deadline.
            dispatcher: {
              dispatch: (options, handler) =>
                this.dispatcher.dispatch(
                  { ...options, headersTimeout: timeout_ms, bodyTimeout: timeout_ms },
                  handler,
                ),
            },
          }
        : {}),
    }
  }
  async json(endpoint, body, { timeout_ms = this.timeout } = {}) {
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0)
      throw Error("Local model call time budget exceeded")
    const r = await this.fetch(this.url + endpoint, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      ...this.transportOptions(timeout_ms),
      redirect: "error",
    })
    if (!r.ok) throw Error(`Ollama HTTP ${r.status}`)
    const result = await r.json()
    if (result.error) throw Error("Ollama: " + result.error)
    return result
  }
  async metadata(model, { timeout_ms = this.timeout } = {}) {
    if (!model || /:cloud$/.test(model)) throw Error("Local model name required")
    const [show, tags, version] = await Promise.all([
      this.json("/api/show", { model }, { timeout_ms }),
      this.json("/api/tags", undefined, { timeout_ms }),
      this.json("/api/version", undefined, { timeout_ms }),
    ])
    const installed = tags.models?.find((m) => m.name === model || m.model === model)
    if (!installed?.digest) throw Error("Requested model is not installed locally")
    return {
      model,
      digest: installed.digest,
      runtime: version.version,
      endpoint: this.url,
      details: show.details,
      capabilities: show.capabilities,
      thinking: show.thinking,
    }
  }
  async streamedChat(request, { timeout_ms, on_progress }) {
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0)
      throw Error("Local model call time budget exceeded")
    const started = performance.now()
    let content = "",
      thinkingChars = 0,
      frames = 0,
      final = null,
      reader
    const progress = (status) => ({
      schema: "local-model-progress/v1",
      status,
      elapsed_ms: Math.round(performance.now() - started),
      frames,
      content_chars: content.length,
      thinking_chars: thinkingChars,
    })
    try {
      await on_progress(progress("requesting"))
      const response = await this.fetch(this.url + "/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        ...this.transportOptions(timeout_ms),
        redirect: "error",
      })
      if (!response.ok) throw Error(`Ollama HTTP ${response.status}`)
      if (
        !response.headers?.get("content-type")?.includes("application/x-ndjson") ||
        !response.body?.getReader
      )
        throw Error("Ollama streaming response must be NDJSON")
      reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8", { fatal: true })
      let pending = ""
      const consume = async (line) => {
        if (!line.trim()) return
        if (final) throw Error("Unexpected data after model completion")
        const frame = JSON.parse(line)
        if (frame.error) throw Error("Ollama: " + frame.error)
        if (typeof frame.done !== "boolean" || frame.message?.tool_calls?.length)
          throw Error("Incomplete or unexpected model response")
        for (const key of ["content", "thinking"])
          if (frame.message?.[key] !== undefined && typeof frame.message[key] !== "string")
            throw Error("Unexpected model message field")
        content += frame.message?.content ?? ""
        thinkingChars += frame.message?.thinking?.length ?? 0
        frames++
        if (content.length + thinkingChars > 4194304)
          throw Error("Model stream exceeds output bound")
        if (frame.done) final = frame
        await on_progress(progress(frame.done ? "received" : "generating"))
      }
      while (true) {
        const chunk = await reader.read()
        pending += decoder.decode(chunk.value, { stream: !chunk.done })
        if (pending.length > 4194304) throw Error("Model stream frame exceeds output bound")
        let newline
        while ((newline = pending.indexOf("\n")) >= 0) {
          await consume(pending.slice(0, newline))
          pending = pending.slice(newline + 1)
        }
        if (chunk.done) break
      }
      if (pending.trim()) await consume(pending)
      if (!final) throw Error("Incomplete model stream")
      return {
        ...final,
        message: { ...final.message, content },
        stream_progress: progress("received"),
      }
    } catch (error) {
      error.model_artifacts = {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        partial_response_content: content,
        partial_response_content_sha256: sha256(content),
        progress: progress("failed"),
        done: final?.done ?? false,
      }
      await on_progress(error.model_artifacts.progress)
      throw error
    } finally {
      if (reader) {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    }
  }
  async structured({
    model,
    think,
    messages,
    schema,
    num_ctx = 8192,
    num_predict = 4096,
    temperature = 0,
    timeout_ms = this.timeout,
    on_progress,
  }) {
    if (
      !Number.isInteger(num_ctx) ||
      num_ctx < 4096 ||
      num_ctx > 32768 ||
      !Number.isInteger(num_predict) ||
      num_predict < 128 ||
      num_predict > 8192 ||
      !Number.isInteger(timeout_ms) ||
      timeout_ms <= 0 ||
      timeout_ms > 3600000 ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2
    )
      throw Error("Invalid local model call budget")
    const request_budget = assertStructuredRequestBudget({ messages, schema, num_ctx, num_predict })
    const started = performance.now()
    const metadata = await this.metadata(model, { timeout_ms })
    const metadata_wall_ms = Math.round(performance.now() - started)
    if (think !== undefined && !metadata.thinking?.values?.some((v) => v === think))
      throw Error("Unsupported think setting for model: " + String(think))
    if (!metadata.capabilities?.includes("completion")) throw Error("Model cannot complete text")
    const request = {
      model,
      think,
      messages,
      format: schema,
      stream: typeof on_progress === "function",
      truncate: false,
      shift: false,
      options: { num_ctx, num_predict, temperature },
      keep_alive: this.keepAlive,
    }
    let context_preflight, context_after
    const observeContext = async () =>
      inspectOllamaLoadedContext(
        await this.json("/api/ps", undefined, {
          timeout_ms: Math.min(5000, Math.floor(timeout_ms - (performance.now() - started))),
        }),
        { model, digest: metadata.digest, num_ctx },
      )
    // GGUF runners have a separate reload contract. Preserve that request path.
    if (metadata.details?.format === "safetensors") {
      try {
        context_preflight = await observeContext()
        if (context_preflight.status === "insufficient")
          throw Error(
            "Loaded MLX context is smaller than requested; wait for natural expiry before a larger first-load request",
          )
      } catch (error) {
        error.model_artifacts = {
          request,
          request_sha256: sha256(JSON.stringify(request)),
          request_sent: false,
          request_budget,
          ...(context_preflight ? { context_preflight } : {}),
        }
        throw error
      }
    }
    const remaining = Math.floor(timeout_ms - (performance.now() - started))
    let response
    try {
      response = request.stream
        ? await this.streamedChat(request, { timeout_ms: remaining, on_progress })
        : await this.json("/api/chat", request, { timeout_ms: remaining })
    } catch (error) {
      error.model_artifacts = {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        request_sent: true,
        request_budget,
        ...error.model_artifacts,
        ...(context_preflight ? { context_preflight } : {}),
      }
      throw ["TimeoutError", "AbortError"].includes(error.name)
        ? modelFailureWithCode(error, "MODEL_CALL_TIMEOUT")
        : error
    }
    let output
    try {
      if (context_preflight) {
        context_after = await observeContext()
        if (context_after.status !== "sufficient")
          throw Error("MLX completion did not report the requested loaded context")
      }
      if (
        response.done !== true ||
        !["stop", undefined].includes(response.done_reason) ||
        response.message?.tool_calls?.length ||
        !response.message?.content?.trim()
      )
        throw Error("Incomplete or unexpected model response")
      try {
        output = JSON.parse(response.message.content)
      } catch {
        throw Error("Model returned invalid JSON")
      }
      assertSchema(output, schema)
    } catch (error) {
      error.model_artifacts = {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        request_budget,
        partial_response_content: response.message?.content ?? "",
        partial_response_content_sha256: sha256(response.message?.content ?? ""),
        ...(response.stream_progress
          ? { progress: { ...response.stream_progress, status: "failed" } }
          : {}),
        done: response.done,
        done_reason: response.done_reason ?? null,
        tool_calls_count: response.message?.tool_calls?.length ?? 0,
        ...(context_preflight ? { context_preflight } : {}),
        ...(context_after ? { context_after } : {}),
      }
      if (error.model_artifacts.progress && typeof on_progress === "function")
        await on_progress(error.model_artifacts.progress)
      throw error
    }
    return {
      output,
      artifacts: {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        request_budget,
        response_content: response.message.content,
        response_content_sha256: sha256(response.message.content),
        done: response.done,
        done_reason: response.done_reason ?? null,
        ...(response.stream_progress ? { stream_progress: response.stream_progress } : {}),
        ...(context_preflight ? { context_preflight, context_after } : {}),
      },
      provenance: {
        ...metadata,
        think: think ?? metadata.thinking?.default ?? null,
        num_ctx,
        num_predict,
        temperature,
        call_timeout_ms: timeout_ms,
        model_keep_alive: this.keepAlive,
        metadata_wall_ms,
        request_budget,
        prompt_sha256: sha256(JSON.stringify(messages)),
        schema_sha256: sha256(JSON.stringify(schema)),
        wall_ms: Math.round(performance.now() - started),
        total_duration: response.total_duration,
        load_duration: response.load_duration,
        prompt_eval_duration: response.prompt_eval_duration,
        prompt_eval_count: response.prompt_eval_count,
        eval_count: response.eval_count,
        eval_duration: response.eval_duration,
        ...(context_after
          ? {
              loaded_context_length: context_after.reported_context_length,
              full_context_window_verified: false,
            }
          : {}),
      },
    }
  }
}
