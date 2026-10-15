import path from "node:path"
import crypto from "node:crypto"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { moduleContext } from "../../scripts/research/module-runtime.mjs"
import { moduleOperation } from "../../scripts/research/module-registry.mjs"
import { validateArguments } from "../../scripts/research/modules/contracts.mjs"
import { researchServerCatalog } from "./server.mjs"
import { sha256 } from "../../scripts/research/contracts.mjs"

// Exercise the real stdio server and read-only native jobs without a model,
// collection request, vault copy, publication or Codex account request.
export async function checkResearchMCP({
  timeoutMs = 30000,
  publicationRun,
  checks,
  ...options
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000)
    throw Error("MCP check timeout must be between 1000 and 60000 ms")
  if (publicationRun !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(publicationRun))
    throw Error("Safe publication run ID required")
  const ctx = moduleContext(options)
  const catalog = researchServerCatalog(options)
  const operations = catalog.modules.flatMap((module) =>
    module.operations.map((operation) => ({ module: module.id, ...operation })),
  )
  const expected = [
    "research_modules",
    "research_job_status",
    "research_job_result",
    "research_job_resume",
    ...(catalog.tool_profile === "compact"
      ? ["research_execute"]
      : operations.map((operation) => operation.tool_name)),
  ].sort()
  if (checks !== undefined) {
    if (!Array.isArray(checks) || !checks.length || checks.length > 6)
      throw Error("Select from one to six explicit read-only MCP checks")
    for (const check of checks) {
      if (
        !check ||
        typeof check !== "object" ||
        Array.isArray(check) ||
        Object.keys(check).some((key) => !["module", "operation", "parameters"].includes(key)) ||
        !operations.some(
          (operation) => operation.module === check.module && operation.id === check.operation,
        )
      )
        throw Error("MCP check operation is not enabled")
      const { operation } = moduleOperation(check.module, check.operation)
      if (!operation.readOnly || operation.network || operation.model)
        throw Error("MCP checks must be read-only without network or model execution")
      validateArguments(check.parameters || {}, operation.inputSchema, ctx)
    }
  } else if (!operations.some((operation) => operation.tool_name === "collection_inventory"))
    throw Error("MCP check requires the collection module for its read-only worker check")
  if (
    publicationRun &&
    !operations.some((operation) => operation.tool_name === "publication_status")
  )
    throw Error("Publication check requires the publication module")
  const args = [fileURLToPath(new URL("./server.mjs", import.meta.url))]
  for (const key of ["repo", "root", "vault", "backlog", "policy"]) args.push(`--${key}`, ctx[key])
  args.push("--max-active-jobs", String(ctx.maxActiveJobs))
  if (options.modules) args.push("--modules", options.modules.join(","))
  if (options.operations) args.push("--operations", options.operations.join(","))
  args.push("--tool-profile", catalog.tool_profile)
  const child = spawn(process.execPath, args, { cwd: ctx.repo, stdio: ["pipe", "pipe", "pipe"] })
  const lines = createInterface({ input: child.stdout })
  const pending = new Map()
  const deadline = Date.now() + timeoutMs
  let nextId = 0,
    stderr = "",
    stopped
  child.stderr.on("data", (bytes) => {
    stderr = (stderr + bytes.toString()).slice(-2000)
  })
  const fail = (error) => {
    stopped = error
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
  }
  child.on("error", fail)
  child.stdin.on("error", fail)
  child.on("exit", (code, signal) =>
    fail(Error(`MCP server exited (${code ?? signal}): ${stderr}`)),
  )
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line)
      const request = pending.get(message.id)
      if (!request) return
      clearTimeout(request.timer)
      pending.delete(message.id)
      if (message.error) request.reject(Error(message.error.message))
      else request.resolve(message.result)
    } catch (error) {
      fail(Error(`Invalid MCP stdout: ${error.message}`))
    }
  })
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      if (stopped) return reject(stopped)
      const remaining = deadline - Date.now()
      if (remaining <= 0) return reject(Error(`MCP check timed out: ${method}`))
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(Error(`MCP check timed out: ${method}`))
      }, remaining)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    })
  const call = async (name, args) => {
    const result = await rpc("tools/call", { name, arguments: args })
    if (result.isError)
      throw Error(
        result.content?.find((entry) => entry.type === "text")?.text || `MCP failed: ${name}`,
      )
    if (!result.structuredContent) throw Error(`Missing structured MCP result: ${name}`)
    return result.structuredContent
  }
  const checkJob = async (module, operation, args) => {
    const job_id = "module-mcp-check-" + crypto.randomUUID()
    const job =
      catalog.tool_profile === "compact"
        ? await call("research_execute", { module, operation, parameters: args, job_id })
        : await call(`${module}_${operation}`, { ...args, job_id })
    let state = job
    while (["queued", "running", "finishing"].includes(state.state)) {
      state = await call("research_job_status", { job_id: job.job_id })
      if (["queued", "running", "finishing"].includes(state.state))
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (state.state !== "completed")
      throw Error(
        `MCP worker ${job.job_id} ${state.state}: ${state.error || "inspect preserved logs"}`,
      )
    let content = "",
      offset = 0,
      page
    do {
      page = await call("research_job_result", { job_id: job.job_id, offset, limit: 64000 })
      if (
        page.job_id !== job.job_id ||
        page.offset !== offset ||
        page.result.sha256 !== state.result.sha256 ||
        page.next_offset !==
          (offset + page.chunk.length < page.total_characters ? offset + page.chunk.length : null)
      )
        throw Error("MCP result pagination or hash reference changed")
      content += page.chunk
      offset = page.next_offset
    } while (offset !== null)
    if (sha256(content) !== state.result.sha256) throw Error("MCP saved result hash changed")
    const saved = JSON.parse(content)
    if (
      saved.input_sha256 !== state.input_sha256 ||
      saved.module !== state.module ||
      saved.operation !== state.operation
    )
      throw Error("MCP result job/input binding changed")
    return { job_id: job.job_id, state: state.state, result: state.result, data: saved.data }
  }
  try {
    const init = await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "research-mcp-check", version: "1.0.0" },
    })
    if (init.serverInfo?.name !== "tech-knowledge-research" || !init.instructions)
      throw Error("Research MCP identity or workflow instructions missing")
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    )
    const tools = (await rpc("tools/list", {})).tools.map((tool) => tool.name).sort()
    if (JSON.stringify(tools) !== JSON.stringify(expected))
      throw Error("Research MCP tool catalog differs")
    const actual = await call("research_modules", {})
    if (JSON.stringify(actual) !== JSON.stringify(catalog))
      throw Error("Research MCP module contracts differ")
    let selected = null
    if (checks) {
      selected = []
      for (const check of checks)
        selected.push({
          module: check.module,
          operation: check.operation,
          ...(await checkJob(check.module, check.operation, check.parameters || {})),
        })
    }
    const inventory = checks ? null : await checkJob("collection", "inventory", {})
    const publication = publicationRun
      ? await checkJob("publication", "status", { run_id: publicationRun })
      : null
    return {
      schema: "research-mcp-check/v1",
      server: init.serverInfo,
      protocol_version: init.protocolVersion,
      module_count: catalog.modules.length,
      operation_count: operations.length,
      tool_profile: catalog.tool_profile,
      tool_count: tools.length,
      ...(inventory
        ? {
            inventory: {
              job_id: inventory.job_id,
              state: inventory.state,
              result: inventory.result,
            },
          }
        : { checks: selected }),
      ...(publication ? { publication } : {}),
    }
  } finally {
    fail(Error("MCP check closed"))
    lines.close()
    child.stdin.destroy()
    const exited = new Promise((resolve) => child.once("exit", resolve))
    child.kill("SIGTERM")
    if (child.exitCode === null && child.signalCode === null) {
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 1000)
      await exited
      clearTimeout(killTimer)
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        repo: { type: "string" },
        root: { type: "string" },
        vault: { type: "string" },
        backlog: { type: "string" },
        policy: { type: "string" },
        modules: { type: "string" },
        operations: { type: "string" },
        "tool-profile": { type: "string" },
        "max-active-jobs": { type: "string" },
        "timeout-ms": { type: "string" },
        "publication-run": { type: "string" },
        "checks-json": { type: "string" },
      },
    })
    const {
      modules,
      operations,
      "tool-profile": toolProfile,
      "max-active-jobs": maxActiveJobs,
      "timeout-ms": timeout,
      "publication-run": publicationRun,
      "checks-json": checksJSON,
      ...options
    } = values
    console.log(
      JSON.stringify(
        await checkResearchMCP({
          ...options,
          ...(modules !== undefined ? { modules: modules.split(",") } : {}),
          ...(operations !== undefined ? { operations: operations.split(",") } : {}),
          ...(toolProfile !== undefined ? { toolProfile } : {}),
          ...(maxActiveJobs !== undefined ? { maxActiveJobs: Number(maxActiveJobs) } : {}),
          ...(timeout !== undefined ? { timeoutMs: Number(timeout) } : {}),
          publicationRun,
          ...(checksJSON !== undefined ? { checks: JSON.parse(checksJSON) } : {}),
        }),
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
