import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"

// Re-execute real saved exchanges through both implementations. Frozen model
// results are replay data; no source review, model, Drive or publisher is run.
export function benchmarkReasoningControl(ctx, p) {
  const inputBytes = fs.readFileSync(safePath(ctx.repo, p.path))
  if (sha256(inputBytes) !== p.sha256) throw Error("Benchmark selection SHA changed")
  const input = JSON.parse(inputBytes)
  if (
    input.schema !== "research-reasoning-control-benchmark/v1" ||
    !Array.isArray(input.exchanges) ||
    input.exchanges.length < 3 ||
    input.exchanges.length > 1000
  )
    throw Error("Bounded saved-exchange benchmark required")
  const checked = (ref, root = ctx.root) => {
    const bytes = fs.readFileSync(safePath(root, ref.path))
    if (sha256(bytes) !== ref.sha256) throw Error("Benchmark evidence changed: " + ref.path)
    return JSON.parse(bytes)
  }
  for (const code of [input.baseline, input.candidate]) {
    if (
      !path.isAbsolute(code.repo) ||
      fs.realpathSync(code.repo) !== code.repo ||
      sha256(fs.readFileSync(safePath(code.repo, "scripts/research/reasoning-tasks.mjs"))) !==
        code.sha256
    )
      throw Error("Benchmark implementation SHA changed")
  }
  const fixed = input.exchanges.map(({ request: requestRef, result: resultRef }) => {
    const request = checked(requestRef),
      result = checked(resultRef)
    if (
      request.owner ||
      result.request_sha256 !== request.request_sha256 ||
      result.task_id !== request.task_id
    )
      throw Error(
        "Replay requires exact historical unowned exchanges; operational owners may not be transplanted",
      )
    return {
      request,
      submission: {
        task_id: result.task_id,
        request_sha256: result.request_sha256,
        executor: result.executor,
        model: result.model,
        output: result.output,
      },
    }
  })
  if (new Set(fixed.map((row) => row.request.task_id)).size !== fixed.length)
    throw Error("Benchmark tasks must be distinct")
  const relative = `.storage/control-benchmarks/${p.sha256}`
  const prior = readJSON(ctx.root, relative + "/receipt.json")
  if (prior) return { ...prior, reused: true }
  const run = (code, label, width) => {
    const root = safePath(ctx.root, relative + "/" + label, { materialize: false })
    for (const row of fixed)
      atomicCreate(root, `reasoning-tasks/${row.request.task_id}/request.json`, row.request)
    const moduleURL = pathToFileURL(
      path.join(code.repo, "scripts/research/reasoning-tasks.mjs"),
    ).href
    const script =
      width === 1
        ? "const [url,root]=process.argv.slice(1); const m=await import(url); const s=JSON.parse(await new Response(process.stdin).text()); await m.submitReasoningResult(root,s[0]);"
        : 'const [url,root]=process.argv.slice(1); const m=await import(url); const s=JSON.parse(await new Response(process.stdin).text()); const r=await m.submitReasoningBatch(root,{results:s}); if(r.status!=="completed")throw Error(JSON.stringify(r));'
    const started = performance.now()
    let calls = 0
    for (let i = 0; i < fixed.length; i += width) {
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", script, moduleURL, root],
        {
          cwd: code.repo,
          input: JSON.stringify(fixed.slice(i, i + width).map((row) => row.submission)),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        },
      )
      if (result.status !== 0)
        throw Error("Benchmark subprocess failed: " + result.stderr.slice(-1000))
      calls++
    }
    const elapsed = performance.now() - started
    const normalized = fixed.map((row) => {
      const result = readJSON(root, `reasoning-tasks/${row.request.task_id}/result.json`)
      return {
        task_id: result.task_id,
        request_sha256: result.request_sha256,
        executor: result.executor,
        model: result.model,
        output: result.output,
      }
    })
    return {
      process_calls: calls,
      control_ms: elapsed,
      output_sha256: sha256(JSON.stringify(normalized)),
    }
  }
  const baseline = run(input.baseline, "baseline", 1),
    candidate = run(input.candidate, "candidate", 3)
  const expected = sha256(JSON.stringify(fixed.map((row) => row.submission)))
  if (baseline.output_sha256 !== expected || candidate.output_sha256 !== expected)
    throw Error("Replay lost, duplicated or changed a saved result")
  const reduction = 1 - candidate.control_ms / baseline.control_ms
  const receipt = {
    schema: "research-reasoning-control-benchmark-result/v1",
    input_sha256: p.sha256,
    exchanges: fixed.length,
    baseline,
    candidate,
    control_wait_reduction: reduction,
    fixed_input_replay_verified: true,
    output_equivalent: true,
    acceptance: reduction >= 0.5 ? "passed" : "below_target",
    scope: "reasoning_submission_control",
    end_to_end_cycle_performance_verified: false,
    model_calls: 0,
    external_calls: 0,
    approvals_created: 0,
    scheduled_runs_counted: 0,
  }
  atomicCreate(ctx.root, relative + "/receipt.json", receipt)
  return receipt
}
