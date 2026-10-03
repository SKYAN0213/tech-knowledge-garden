import { assertSchema, sha256 } from "./contracts.mjs"

export const DEFAULT_LOCAL_OLLAMA_URL = "http://127.0.0.1:11434"

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

export class Ollama {
  constructor({ url = DEFAULT_LOCAL_OLLAMA_URL, fetchImpl = fetch, timeout_ms = 300000 } = {}) {
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0 || timeout_ms > 3600000)
      throw Error("Invalid local model timeout")
    this.url = validateLocalOllamaURL(url)
    this.fetch = fetchImpl
    this.timeout = timeout_ms
  }
  async json(endpoint, body, { timeout_ms = this.timeout } = {}) {
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0)
      throw Error("Local model call time budget exceeded")
    const r = await this.fetch(this.url + endpoint, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout_ms),
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
        signal: AbortSignal.timeout(timeout_ms),
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
    const started = performance.now()
    const metadata = await this.metadata(model, { timeout_ms })
    const metadata_wall_ms = Math.round(performance.now() - started)
    if (think !== undefined && !metadata.thinking?.values?.some((v) => v === think))
      throw Error("Unsupported think setting for model: " + String(think))
    if (!metadata.capabilities?.includes("completion")) throw Error("Model cannot complete text")
    // Conservative input bound; oversized sources are split upstream instead of silently truncated.
    const chars = messages.reduce((n, m) => n + m.content.length, 0) + JSON.stringify(schema).length
    if (chars > num_ctx * 2) throw Error("Input exceeds conservative context budget")
    const request = {
      model,
      think,
      messages,
      format: schema,
      stream: typeof on_progress === "function",
      options: { num_ctx, num_predict, temperature },
      keep_alive: "5m",
    }
    const remaining = Math.floor(timeout_ms - (performance.now() - started))
    const response = request.stream
      ? await this.streamedChat(request, { timeout_ms: remaining, on_progress })
      : await this.json("/api/chat", request, { timeout_ms: remaining })
    let output
    try {
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
      if (response.stream_progress)
        error.model_artifacts = {
          request,
          request_sha256: sha256(JSON.stringify(request)),
          partial_response_content: response.message.content,
          partial_response_content_sha256: sha256(response.message.content),
          progress: { ...response.stream_progress, status: "failed" },
          done: response.done,
          done_reason: response.done_reason ?? null,
        }
      if (error.model_artifacts) await on_progress(error.model_artifacts.progress)
      throw error
    }
    return {
      output,
      artifacts: {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        response_content: response.message.content,
        response_content_sha256: sha256(response.message.content),
        done: response.done,
        done_reason: response.done_reason ?? null,
        ...(response.stream_progress ? { stream_progress: response.stream_progress } : {}),
      },
      provenance: {
        ...metadata,
        think: think ?? metadata.thinking?.default ?? null,
        num_ctx,
        num_predict,
        temperature,
        call_timeout_ms: timeout_ms,
        metadata_wall_ms,
        prompt_sha256: sha256(JSON.stringify(messages)),
        schema_sha256: sha256(JSON.stringify(schema)),
        wall_ms: Math.round(performance.now() - started),
        total_duration: response.total_duration,
        load_duration: response.load_duration,
        prompt_eval_duration: response.prompt_eval_duration,
        prompt_eval_count: response.prompt_eval_count,
        eval_count: response.eval_count,
        eval_duration: response.eval_duration,
      },
    }
  }
}
