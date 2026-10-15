import { Ollama, localOllamaURL } from "./ollama.mjs"
import { OpenAIResponses } from "./openai.mjs"
import { DelegatedReasoning } from "./reasoning-tasks.mjs"
import { resolveRolePolicy } from "./model-policy.mjs"

// One invocation shares its remaining wall time and fresh generation slots
// across source-specific caches. Cached/delegated waiting tasks consume no slot.
export function createModelExecutionWindow({
  time_budget_ms,
  max_model_calls,
  now = () => performance.now(),
} = {}) {
  if (
    time_budget_ms !== undefined &&
    (!Number.isInteger(time_budget_ms) || time_budget_ms < 1 || time_budget_ms > 7200000)
  )
    throw Error("Execution time budget must be 1..7200000 ms")
  if (
    max_model_calls !== undefined &&
    (!Number.isInteger(max_model_calls) || max_model_calls < 1 || max_model_calls > 64)
  )
    throw Error("Execution model call limit must be 1..64")
  const started = now()
  let calls = 0
  return {
    remainingMs: () =>
      time_budget_ms === undefined
        ? Infinity
        : Math.max(0, Math.floor(time_budget_ms - (now() - started))),
    reserveCall() {
      if (max_model_calls !== undefined && calls >= max_model_calls) {
        const error = Error("Invocation model call budget reached; completed batches preserved")
        error.code = "MODEL_CALL_LIMIT"
        error.model_budget = {
          max_model_calls,
          model_calls: calls,
          request_sent: false,
          requires_explicit_resume: true,
        }
        throw error
      }
      calls++
    },
    get model_calls() {
      return calls
    },
  }
}

export function createModelProvider(policy, role, { root, run, overrides = {} } = {}) {
  const settings = resolveRolePolicy(policy, role, overrides)
  if (settings.provider === "codex") return new DelegatedReasoning({ root, run, role, settings })
  if (settings.provider === "openai") return new OpenAIResponses()
  return new Ollama({
    url: process.env.TECH_KNOWLEDGE_OLLAMA_URL ?? policy.runtime?.ollama_url ?? localOllamaURL(),
  })
}
