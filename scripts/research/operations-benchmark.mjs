import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawnSync, spawn, execFileSync } from "node:child_process"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import { instantiateProcessingFixture } from "./processing-fixture.mjs"
import { implementationFiles } from "./development-release.mjs"
import { assertNoOperationalWriter } from "./operations-deployment.mjs"

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

export function processingCodeFingerprint(repo) {
  repo = fs.realpathSync(repo)
  const files = implementationFiles(repo).map((file) => ({
    path: file,
    sha256: sha256(fs.readFileSync(safePath(repo, file))),
  }))
  return { repo, files, sha256: sha256(JSON.stringify(files)) }
}

export function compareProcessingArtifacts(baseline, candidate) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical)
    if (!value || typeof value !== "object") return value
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    )
  }
  // Compare complete native records, including draft history/provenance and
  // every source. Only object-key order and selected-row order are normalized.
  const project = (artifacts) =>
    [...artifacts].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
  const a = project(baseline.artifacts),
    b = project(candidate.artifacts)
  if (
    a.length !== 32 ||
    b.length !== 32 ||
    new Set(a.map((r) => r.candidate_id)).size !== 32 ||
    new Set(b.map((r) => r.candidate_id)).size !== 32
  )
    throw Error("Exactly 32 distinct comparable articles required")
  const differences = a.flatMap((row, i) =>
    [...new Set([...Object.keys(row), ...Object.keys(b[i])])]
      .filter((k) => JSON.stringify(canonical(row[k])) !== JSON.stringify(canonical(b[i][k])))
      .map((field) => ({ candidate_id: row.candidate_id, field })),
  )
  return {
    equivalent: differences.length === 0,
    differences,
    baseline_sha256: sha256(JSON.stringify(canonical(a))),
    candidate_sha256: sha256(JSON.stringify(canonical(b))),
    exclusions: [],
    content_fields_excluded: [],
  }
}

export async function benchmarkArticleProcessing(ctx, p) {
  const file = safePath(ctx.repo, p.path),
    bytes = fs.readFileSync(file)
  if (sha256(bytes) !== p.sha256) throw Error("Article benchmark input SHA changed")
  const input = JSON.parse(bytes)
  if (
    input.schema !== "research-article-processing-benchmark/v1" ||
    !input.fixture ||
    !input.baseline ||
    !input.candidate ||
    !path.isAbsolute(input.destination) ||
    fs.existsSync(input.destination)
  )
    throw Error("Fresh, explicitly frozen article benchmark input required")
  const fixtureBytes = fs.readFileSync(input.fixture.path)
  if (sha256(fixtureBytes) !== input.fixture.sha256) throw Error("Article fixture SHA changed")
  const fixture = JSON.parse(fixtureBytes)
  if (
    fixture.fresh_articles !== 31 ||
    fixture.preserved_reuse !== 1 ||
    fixture.articles.length !== 32
  )
    throw Error("Original 31 new plus one historical reuse composition required")
  for (const code of [input.baseline, input.candidate])
    if (processingCodeFingerprint(code.repo).sha256 !== code.sha256)
      throw Error("Frozen processing implementation changed")
  assertNoOperationalWriter(ctx.repo)
  fs.mkdirSync(input.destination, { recursive: false })
  const run = async (label, code, mode) => {
    assertNoOperationalWriter(ctx.repo)
    const instance = instantiateProcessingFixture(
      input.fixture,
      path.join(input.destination, label),
      { executionRepo: code.repo },
    )
    const config = { code_repo: code.repo, instance, mode }
    const configFile = path.join(input.destination, label + ".json")
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n")
    const worker = new URL("processing-replay.mjs", import.meta.url)
    const child = spawn(process.execPath, [fileURLToPath(worker), configFile], {
      cwd: instance.repo,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = "",
      stderr = "",
      interference = false,
      busy = 0
    const observations = [],
      capacity = os.availableParallelism() * 100
    const observe = () => {
      const output = execFileSync("/bin/ps", ["-axo", "pid,pcpu,comm"], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
      })
      const rows = output
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/, 3))
      const foreignCPU = rows
        .filter(([pid]) => ![process.pid, child.pid].includes(Number(pid)))
        .reduce((n, [, cpu]) => n + (Number(cpu) || 0), 0)
      busy = foreignCPU >= capacity * 0.8 ? busy + 1 : 0
      if (busy >= 2) interference = true
      observations.push({
        observed_at: new Date().toISOString(),
        foreign_cpu_percent: foreignCPU,
        logical_cpu_capacity_percent: capacity,
        load_average: os.loadavg(),
      })
    }
    child.stdout.on("data", (bytes) => {
      stdout += bytes
    })
    child.stderr.on("data", (bytes) => {
      stderr += bytes
    })
    observe()
    const timer = setInterval(observe, 10000)
    let exit
    try {
      exit = await new Promise((resolve, reject) => {
        child.once("exit", resolve)
        child.once("error", reject)
      })
    } finally {
      clearInterval(timer)
    }
    observe()
    fs.writeFileSync(path.join(input.destination, label + ".log"), stdout + stderr)
    if (exit !== 0) throw Error("Native article replay failed: " + label + "; see preserved log")
    const result = JSON.parse(stdout.trim().split("\n").at(-1))
    const receiptBytes = fs.readFileSync(result.path)
    if (sha256(receiptBytes) !== result.sha256) throw Error("Replay result changed")
    if (processingCodeFingerprint(code.repo).sha256 !== code.sha256)
      throw Error("Implementation changed during replay")
    assertNoOperationalWriter(ctx.repo)
    return { ...result, observations, interference, value: JSON.parse(receiptBytes) }
  }
  const pairs = []
  const pair = async (reverse) => {
    const order = reverse ? ["candidate", "baseline"] : ["baseline", "candidate"],
      results = {}
    for (const label of order)
      results[label] = await run(
        `pair-${pairs.length + 1}-${label}`,
        input[label],
        label === "baseline" ? "separate/v1" : "combined/v1",
      )
    const comparison = compareProcessingArtifacts(results.baseline.value, results.candidate.value)
    if (!comparison.equivalent) {
      fs.writeFileSync(
        path.join(input.destination, "comparison-failure.json"),
        JSON.stringify(comparison, null, 2),
      )
      throw Error("Native processing content or decisions differ; no performance acceptance")
    }
    const reduction =
      1 - results.candidate.control_validation_ms / results.baseline.control_validation_ms
    const compact = Object.fromEntries(
      Object.entries(results).map(([k, { value, ...r }]) => [k, r]),
    )
    const interference = results.baseline.interference || results.candidate.interference
    const paired = { order, ...compact, reduction, comparison, interference, valid: !interference }
    pairs.push(paired)
    return paired
  }
  const first = await pair(false)
  if ((first.reduction >= 0.45 && first.reduction <= 0.55) || first.interference) await pair(true)
  const valid = pairs.filter((p) => p.valid)
  const reduction = valid.length ? Math.min(...valid.map((p) => p.reduction)) : null
  const receipt = {
    schema: "research-article-processing-benchmark-result/v1",
    input_sha256: p.sha256,
    fixture: input.fixture,
    baseline: input.baseline,
    candidate: input.candidate,
    pairs,
    scope: "article_processing",
    selected: 32,
    fresh: 31,
    prior_reuse: 1,
    control_validation_reduction: reduction,
    acceptance:
      reduction === null ? "no_valid_measurement" : reduction >= 0.5 ? "passed" : "below_target",
    output_equivalent: true,
    model_calls: 0,
    external_calls: 0,
    production_writes: 0,
    whole_live_ab_reduction: null,
    actual_luna_run: null,
    recorded_response_transformations: true,
    interference_policy:
      "native production writer absent before/after each case; two consecutive 10s observations of foreign CPU >=80% of logical host capacity invalidate that pair",
  }
  const receiptFile = path.join(input.destination, "receipt.json")
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n")
  return {
    ...receipt,
    receipt: { path: receiptFile, sha256: sha256(fs.readFileSync(receiptFile)) },
  }
}
