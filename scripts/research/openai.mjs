import { assertSchema, sha256 } from "./contracts.mjs"

const baseURL = "https://api.openai.com/v1"
const reasoningEfforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]

function outputText(response) {
  const parts = []
  for (const item of response.output ?? []) {
    if (item.type !== "message" || item.role !== "assistant") continue
    for (const content of item.content ?? []) {
      if (content.type === "refusal") throw Error("OpenAI refused the structured research request")
      if (content.type === "output_text" && typeof content.text === "string")
        parts.push(content.text)
    }
  }
  return parts.join("").trim()
}

export class OpenAIResponses {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl = fetch,
    timeout_ms = 300000,
  } = {}) {
    if (typeof apiKey !== "string" || !apiKey.trim())
      throw Error("OPENAI_API_KEY is required for the explicitly selected OpenAI provider")
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0 || timeout_ms > 3600000)
      throw Error("Invalid OpenAI model timeout")
    this.apiKey = apiKey.trim()
    this.fetch = fetchImpl
    this.timeout = timeout_ms
  }

  async json(endpoint, body, { timeout_ms = this.timeout } = {}) {
    if (!Number.isInteger(timeout_ms) || timeout_ms <= 0)
      throw Error("OpenAI model call time budget exceeded")
    const response = await this.fetch(baseURL + endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout_ms),
      redirect: "error",
    })
    if (!response.ok) throw Error(`OpenAI API HTTP ${response.status}`)
    const value = await response.json()
    if (value.error)
      throw Error(`OpenAI API error: ${value.error.code || value.error.type || "request_failed"}`)
    return value
  }

  async metadata(model, { timeout_ms = this.timeout } = {}) {
    if (!/^[\w.-]{1,100}$/.test(model || "")) throw Error("Invalid OpenAI model identifier")
    const result = await this.json(`/models/${encodeURIComponent(model)}`, undefined, {
      timeout_ms,
    })
    if (result.id !== model) throw Error("OpenAI returned metadata for a different model")
    return {
      model,
      digest: sha256(
        JSON.stringify({ id: result.id, created: result.created, owned_by: result.owned_by }),
      ),
      runtime: "openai-responses/v1",
      details: { owned_by: result.owned_by, created: result.created },
      capabilities: ["completion"],
      thinking: { values: [false, true, ...reasoningEfforts], default: "medium" },
    }
  }

  async structured({
    model,
    think,
    messages,
    schema,
    num_predict = 4096,
    temperature = 0,
    timeout_ms = this.timeout,
  }) {
    if (
      !Array.isArray(messages) ||
      !messages.length ||
      !Number.isInteger(num_predict) ||
      num_predict < 128 ||
      num_predict > 8192 ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2 ||
      !Number.isInteger(timeout_ms) ||
      timeout_ms <= 0 ||
      timeout_ms > 3600000
    )
      throw Error("Invalid OpenAI structured request")

    const started = performance.now()
    const metadata = await this.metadata(model, { timeout_ms })
    if (!metadata.capabilities.includes("completion"))
      throw Error("OpenAI model cannot complete text")
    const effort = think === false ? "none" : think === true ? "medium" : think
    if (!reasoningEfforts.includes(effort)) throw Error("Unsupported OpenAI reasoning effort")
    const request = {
      model,
      store: false,
      reasoning: { effort },
      max_output_tokens: num_predict,
      input: messages.map(({ role, content }) => ({
        role: role === "system" ? "developer" : role,
        content,
      })),
      text: {
        format: { type: "json_schema", name: "research_output", strict: true, schema },
      },
    }
    if (effort === "none") request.temperature = temperature
    const remaining = Math.floor(timeout_ms - (performance.now() - started))
    const response = await this.json("/responses", request, { timeout_ms: remaining })
    if (response.status !== "completed")
      throw Error(`OpenAI response is ${response.status || "incomplete"}`)
    const content = outputText(response)
    if (!content) throw Error("OpenAI returned no structured output")
    let output
    try {
      output = JSON.parse(content)
    } catch {
      throw Error("OpenAI returned invalid JSON")
    }
    assertSchema(output, schema)
    return {
      output,
      artifacts: {
        request,
        request_sha256: sha256(JSON.stringify(request)),
        response_content: content,
        response_content_sha256: sha256(content),
        response_id: response.id ?? null,
        response_status: response.status,
      },
      provenance: {
        ...metadata,
        think: effort,
        num_predict,
        temperature: effort === "none" ? temperature : null,
        call_timeout_ms: timeout_ms,
        prompt_sha256: sha256(JSON.stringify(messages)),
        schema_sha256: sha256(JSON.stringify(schema)),
        wall_ms: Math.round(performance.now() - started),
        response_id: response.id ?? null,
        service_tier: response.service_tier ?? null,
        usage: response.usage ?? null,
      },
    }
  }
}
