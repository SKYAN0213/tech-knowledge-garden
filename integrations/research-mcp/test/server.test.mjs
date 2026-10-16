import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import {
  moduleContext,
  moduleJobStatus,
  submitModuleJob,
} from "../../../scripts/research/module-runtime.mjs"
import { checkResearchMCP } from "../check.mjs"
import { createResearchServer, researchServerCatalog } from "../server.mjs"

const repo = fs.realpathSync(fileURLToPath(new URL("../../../", import.meta.url)))
function fixture(t) {
  fs.mkdirSync(path.join(repo, ".local/research"), { recursive: true })
  const root = fs.mkdtempSync(path.join(repo, ".local/research/mcp-module-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return { ctx: moduleContext({ repo, root }), root }
}

function stdioClient(t, root, { modules, toolProfile, operations } = {}) {
  const child = spawn(
    process.execPath,
    [
      path.join(repo, "integrations/research-mcp/server.mjs"),
      "--repo",
      repo,
      "--root",
      root,
      ...(toolProfile ? ["--tool-profile", toolProfile] : []),
      ...(modules ? ["--modules", modules.join(",")] : []),
      ...(operations ? ["--operations", operations.join(",")] : []),
    ],
    { cwd: path.parse(repo).root, stdio: ["pipe", "pipe", "pipe"] },
  )
  t.after(() => child.kill("SIGTERM"))
  let nextId = 0
  const state = { stderr: "" }
  child.stderr.on("data", (value) => {
    state.stderr += value
  })
  const pending = new Map(),
    lines = createInterface({ input: child.stdout })
  lines.on("line", (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch (error) {
      for (const entry of pending.values()) entry.reject(Error("Non-protocol stdout: " + line))
      return
    }
    if (pending.has(message.id)) {
      const request = pending.get(message.id)
      clearTimeout(request.timer)
      pending.delete(message.id)
      request.resolve(message)
    }
  })
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId,
        timer = setTimeout(() => {
          pending.delete(id)
          reject(Error(`MCP timeout: ${method} ${state.stderr}`))
        }, 8000)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    })
  return { child, rpc, state }
}

test("official SDK stdio MCP initializes, publishes shared schemas and completes an independently launched inventory job", async (t) => {
  const { ctx, root } = fixture(t)
  const { child, rpc, state } = stdioClient(t, root, {
    modules: ["collection", "edition", "publication"],
    toolProfile: "detailed",
  })
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "real-stdio-test", version: "1.0" },
  })
  assert.equal(init.result.serverInfo.name, "tech-knowledge-research")
  assert.match(init.result.instructions.slice(0, 512), /research_job_status/)
  assert.match(init.result.instructions.slice(0, 512), /research_job_resume/)
  assert.match(init.result.instructions.slice(0, 512), /검토 대기/)
  assert.ok(init.result.instructions.includes(`root=${root}`))
  assert.ok(init.result.instructions.includes("활성 모듈=collection,edition,publication"))
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n")
  const tools = (await rpc("tools/list")).result.tools
  assert.equal(
    tools.length,
    researchServerCatalog({
      modules: ["collection", "edition", "publication"],
      toolProfile: "detailed",
    }).exposed_tool_count,
  )
  assert.deepEqual(tools.find((tool) => tool.name === "publication_prepare").inputSchema.required, [
    "run_id",
    "workflow_path",
    "workflow_sha256",
  ])
  assert.equal(
    tools.some((tool) => tool.name.startsWith("writing_")),
    false,
  )
  assert.equal(
    tools
      .find((tool) => tool.name === "edition_freeze")
      .inputSchema.required.includes("report_sha256"),
    true,
  )
  const call = await rpc("tools/call", {
    name: "collection_inventory",
    arguments: { job_id: "module-mcp-inventory" },
  })
  assert.equal(call.result.isError, undefined)
  assert.equal(call.result.structuredContent.job_id, "module-mcp-inventory")
  let status
  for (let i = 0; i < 120; i++) {
    status = (
      await rpc("tools/call", {
        name: "research_job_status",
        arguments: { job_id: "module-mcp-inventory" },
      })
    ).result.structuredContent
    if (["completed", "failed", "interrupted"].includes(status.state)) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(status.state, "completed", state.stderr)
  assert.equal(moduleJobStatus(ctx, "module-mcp-inventory").state, "completed")
  const result = await rpc("tools/call", {
    name: "research_job_result",
    arguments: { job_id: "module-mcp-inventory", limit: 128 },
  })
  assert.equal(result.result.structuredContent.next_offset, 128)
  const local = await rpc("tools/call", {
    name: "publication_status",
    arguments: { run_id: "publication-absent", job_id: "module-mcp-publication" },
  })
  assert.equal(local.result.isError, undefined)
  let localStatus
  for (let i = 0; i < 120; i++) {
    localStatus = moduleJobStatus(ctx, "module-mcp-publication")
    if (["completed", "failed", "interrupted"].includes(localStatus.state)) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(localStatus.state, "completed", state.stderr)
  const localResult = await rpc("tools/call", {
    name: "research_job_result",
    arguments: { job_id: "module-mcp-publication" },
  })
  const publication = JSON.parse(localResult.result.structuredContent.chunk).data
  assert.equal(publication.status, "handoff_pending")
  assert.equal(publication.candidate_published, false)
  assert.equal(publication.drive_verified, false)
  assert.equal(fs.existsSync(path.join(root, "runs/publication-absent")), false)
  const bad = await rpc("tools/call", {
    name: "edition_freeze",
    arguments: { run_id: "missing", report_path: "missing.json", report_sha256: "a".repeat(64) },
  })
  assert.equal(bad.result.isError, true)
  fs.mkdirSync(path.join(root, "source-route-reviews"), { recursive: true })
  fs.writeFileSync(
    path.join(root, "source-route-reviews/latest.json"),
    JSON.stringify({ path: "missing-review.json", sha256: "a".repeat(64) }),
  )
  const failedArgs = { job_id: "module-mcp-failed" }
  await rpc("tools/call", { name: "collection_inventory", arguments: failedArgs })
  let failedStatus
  for (let i = 0; i < 120; i++) {
    failedStatus = (await rpc("tools/call", { name: "research_job_status", arguments: failedArgs }))
      .result
    if (["completed", "failed", "interrupted"].includes(failedStatus.structuredContent.state)) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(failedStatus.structuredContent.state, "failed")
  assert.equal(failedStatus.isError, undefined)
  const replay = (await rpc("tools/call", { name: "collection_inventory", arguments: failedArgs }))
    .result
  assert.equal(replay.isError, true)
  assert.equal(replay.structuredContent.state, "failed")
  assert.equal(replay.structuredContent.attempt, 1)
  assert.equal(replay.structuredContent.resume_available, true)
  assert.match(replay.structuredContent.error, /missing-review/)
  assert.equal(state.stderr, "")
})

test("MCP runtime check launches real workers, verifies saved results and preserves pending publication", async (t) => {
  const { root } = fixture(t)
  const result = await checkResearchMCP({
    repo,
    root,
    publicationRun: "no-approved-handoff",
    toolProfile: "detailed",
  })
  const catalog = researchServerCatalog({ toolProfile: "detailed" })
  assert.equal(result.tool_count, catalog.exposed_tool_count)
  assert.equal(result.module_count, catalog.modules.length)
  assert.equal(
    result.operation_count,
    catalog.modules.reduce((count, module) => count + module.operations.length, 0),
  )
  assert.equal(result.tool_profile, "detailed")
  assert.equal(result.inventory.state, "completed")
  assert.ok(fs.existsSync(path.join(root, result.inventory.result.path)))
  assert.equal(result.publication.state, "completed")
  assert.equal(result.publication.data.status, "handoff_pending")
  assert.equal(result.publication.data.candidate_published, false)
  assert.equal(result.publication.data.drive_verified, false)
  assert.equal(fs.existsSync(path.join(root, "runs/no-approved-handoff")), false)
})

test("MCP runtime check reports native failure and rejects unusable check settings", async (t) => {
  const { root } = fixture(t)
  await assert.rejects(() => checkResearchMCP({ repo, root, timeoutMs: 0 }), /timeout/)
  await assert.rejects(
    () => checkResearchMCP({ repo, root, modules: ["publication"] }),
    /collection module/,
  )
  fs.mkdirSync(path.join(root, "source-route-reviews"), { recursive: true })
  fs.writeFileSync(
    path.join(root, "source-route-reviews/latest.json"),
    JSON.stringify({ path: "missing-review.json", sha256: "a".repeat(64) }),
  )
  await assert.rejects(
    () => checkResearchMCP({ repo, root, modules: ["collection"] }),
    /MCP worker .* failed: .*missing-review/,
  )
  const cli = spawnSync(
    process.execPath,
    [path.join(repo, "integrations/research-mcp/check.mjs"), "--repo", repo, "--root", root],
    { cwd: path.parse(repo).root, encoding: "utf8", timeout: 10000 },
  )
  assert.equal(cli.status, 1, cli.stderr)
  assert.equal(cli.stdout, "")
  assert.match(cli.stderr, /MCP worker .* failed: .*missing-review/)
  const emptyRun = spawnSync(
    process.execPath,
    [path.join(repo, "integrations/research-mcp/check.mjs"), "--publication-run", ""],
    { cwd: path.parse(repo).root, encoding: "utf8", timeout: 10000 },
  )
  assert.equal(emptyRun.status, 1, emptyRun.stderr)
  assert.match(emptyRun.stderr, /Safe publication run ID required/)
})

test("default compact MCP exposes five tools, discovers native contracts and enforces module boundaries", async (t) => {
  const { ctx, root } = fixture(t)
  const { child, rpc, state } = stdioClient(t, root, {
    modules: ["collection"],
  })
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "compact-stdio-test", version: "1.0" },
  })
  assert.match(init.result.instructions, /compact 도구 모드/)
  assert.match(init.result.instructions, /research_execute/)
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n")
  const tools = (await rpc("tools/list")).result.tools
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      "research_modules",
      "research_execute",
      "research_job_status",
      "research_job_result",
      "research_job_resume",
    ].sort(),
  )
  assert.equal(
    tools.find((tool) => tool.name === "research_execute").inputSchema.properties.parameters.type,
    "object",
  )
  const catalog = (await rpc("tools/call", { name: "research_modules", arguments: {} })).result
    .structuredContent
  assert.deepEqual(
    catalog,
    researchServerCatalog({ modules: ["collection"], toolProfile: "compact" }),
  )
  assert.equal(catalog.tool_profile, "compact")
  assert.equal(catalog.exposed_tool_count, 5)
  assert.ok(
    catalog.modules[0].operations.find((operation) => operation.id === "inventory").inputSchema,
  )

  const job_id = "module-mcp-compact-inventory"
  const call = await rpc("tools/call", {
    name: "research_execute",
    arguments: { module: "collection", operation: "inventory", parameters: {}, job_id },
  })
  assert.equal(call.result.isError, undefined)
  assert.equal(call.result.structuredContent.job_id, job_id)
  let status
  for (let i = 0; i < 120; i++) {
    status = (await rpc("tools/call", { name: "research_job_status", arguments: { job_id } }))
      .result.structuredContent
    // Status reads the saved state before checking worker liveness. A fast
    // worker can commit completion and exit between those reads, yielding one
    // stale interrupted snapshot. Poll only; never resubmit or resume the job.
    // A real interruption still fails the completed assertion at the bound.
    if (["completed", "failed"].includes(status.state)) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(status.state, "completed", JSON.stringify({ status, stderr: state.stderr }))
  let saved,
    content = "",
    offset = 0
  do {
    saved = (
      await rpc("tools/call", {
        name: "research_job_result",
        arguments: { job_id, offset, limit: 64000 },
      })
    ).result.structuredContent
    assert.equal(saved.result.sha256, status.result.sha256)
    assert.equal(saved.offset, offset)
    content += saved.chunk
    offset = saved.next_offset
  } while (offset !== null)
  assert.equal(JSON.parse(content).module, "collection")

  for (const [module, operation, parameters, expected] of [
    ["collection", "unknown", {}, /Unknown research module operation/],
    ["publication", "status", { run_id: "disabled" }, /Module is not enabled/],
    ["collection", "inventory", { unexpected: true }, /Unknown module field/],
  ]) {
    const rejected = (
      await rpc("tools/call", {
        name: "research_execute",
        arguments: { module, operation, parameters, job_id: "module-mcp-compact-invalid" },
      })
    ).result
    assert.equal(rejected.isError, true)
    assert.match(rejected.content[0].text, expected)
    assert.equal(fs.existsSync(path.join(root, "module-jobs/module-mcp-compact-invalid")), false)
  }
  const hidden = await submitModuleJob(
    ctx,
    "publication",
    "status",
    { run_id: "compact-hidden-run" },
    { jobId: "module-mcp-compact-hidden", background: false },
  )
  assert.equal(hidden.state, "completed")
  for (const name of ["research_job_status", "research_job_result", "research_job_resume"]) {
    const denied = (await rpc("tools/call", { name, arguments: { job_id: hidden.job_id } })).result
    assert.equal(denied.isError, true)
    assert.match(denied.content[0].text, /Module is not enabled/)
  }
  assert.equal(state.stderr, "")
})

test("MCP runtime check supports compact routing and rejects unknown profiles before startup", async (t) => {
  const { root } = fixture(t)
  const result = await checkResearchMCP({
    repo,
    root,
    modules: ["collection", "publication"],
    toolProfile: "compact",
    publicationRun: "compact-unpublished",
  })
  assert.equal(result.tool_count, 5)
  assert.equal(result.tool_profile, "compact")
  assert.equal(result.inventory.state, "completed")
  assert.equal(result.publication.data.status, "handoff_pending")
  assert.equal(result.publication.data.candidate_published, false)
  assert.equal(result.publication.data.drive_verified, false)
  assert.throws(
    () => createResearchServer({ repo, root, toolProfile: "unknown" }),
    /Unknown MCP tool profile/,
  )
  await assert.rejects(
    () => checkResearchMCP({ repo, root, toolProfile: "unknown" }),
    /Unknown MCP tool profile/,
  )
  for (const file of ["server.mjs", "check.mjs"]) {
    const cli = spawnSync(
      process.execPath,
      [
        path.join(repo, "integrations/research-mcp", file),
        "--repo",
        repo,
        "--root",
        root,
        "--tool-profile",
        "unknown",
      ],
      { cwd: path.parse(repo).root, encoding: "utf8", timeout: 10000 },
    )
    assert.equal(cli.status, 1, cli.stderr)
    assert.equal(cli.stdout, "")
    assert.match(cli.stderr, /Unknown MCP tool profile/)
  }
})

test("operation-scoped MCP discovers selected contracts and denies disabled execution and job access", async (t) => {
  const { ctx, root } = fixture(t)
  const { child, rpc } = stdioClient(t, root, {
    modules: ["collection"],
    operations: ["collection.inventory"],
  })
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "scoped-test", version: "1" },
  })
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n")
  const call = async (name, args) => (await rpc("tools/call", { name, arguments: args })).result
  const summary = (await call("research_modules", { include_schemas: false })).structuredContent
  assert.deepEqual(
    summary.modules[0].operations.map((op) => op.id),
    ["inventory"],
  )
  assert.equal(summary.modules[0].operations[0].inputSchema, undefined)
  const exact = (await call("research_modules", { module: "collection", operation: "inventory" }))
    .structuredContent
  assert.equal(exact.modules[0].operations[0].inputSchema.type, "object")
  for (const args of [{ operation: "inventory" }, { module: "collection", operation: "daily" }]) {
    assert.equal((await call("research_modules", args)).isError, true)
  }
  const rejected = await call("research_execute", {
    module: "collection",
    operation: "report",
    parameters: { run_id: "hidden" },
    job_id: "module-scoped-rejected",
  })
  assert.equal(rejected.isError, true)
  assert.equal(fs.existsSync(path.join(root, "module-jobs/module-scoped-rejected")), false)
  const hidden = await submitModuleJob(
    ctx,
    "collection",
    "report",
    { run_id: "hidden" },
    { jobId: "module-scoped-hidden", background: false },
  )
  for (const name of ["research_job_status", "research_job_result", "research_job_resume"])
    assert.equal((await call(name, { job_id: hidden.job_id })).isError, true)
  assert.throws(
    () => researchServerCatalog({ modules: ["collection"], operations: ["knowledge.status"] }),
    /operation selection/,
  )
})
