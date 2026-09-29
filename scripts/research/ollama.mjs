import { assertSchema, sha256 } from "./contracts.mjs"

export class Ollama {
  constructor({ url = "http://127.0.0.1:11434", fetchImpl = fetch, timeout_ms = 300000 } = {}) {
    const u = new URL(url)
    if (
      !/^https?:$/.test(u.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
      u.username ||
      u.password
    )
      throw Error("Ollama must use a local endpoint")
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0 || timeout_ms > 3600000)
      throw Error("Invalid local model timeout")
    this.url = url.replace(/\/$/, "")
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
      details: show.details,
      capabilities: show.capabilities,
      thinking: show.thinking,
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
      stream: false,
      options: { num_ctx, num_predict, temperature },
      keep_alive: "5m",
    }
    const remaining = Math.floor(timeout_ms - (performance.now() - started))
    const response = await this.json("/api/chat", request, { timeout_ms: remaining })
    if (
      response.done !== true ||
      !["stop", undefined].includes(response.done_reason) ||
      response.message?.tool_calls?.length ||
      !response.message?.content?.trim()
    )
      throw Error("Incomplete or unexpected model response")
    let output
    try {
      output = JSON.parse(response.message.content)
    } catch {
      throw Error("Model returned invalid JSON")
    }
    assertSchema(output, schema)
    return {
      output,
      artifacts: {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        response_content: response.message.content,
        response_content_sha256: sha256(response.message.content),
        done: response.done,
        done_reason: response.done_reason ?? null,
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
        prompt_eval_count: response.prompt_eval_count,
        eval_count: response.eval_count,
        eval_duration: response.eval_duration,
      },
    }
  }
}
