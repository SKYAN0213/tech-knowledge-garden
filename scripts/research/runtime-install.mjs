import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { RunState, atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { Ollama, localOllamaURL, DEFAULT_LOCAL_OLLAMA_MODEL } from "./ollama.mjs"
import { withLocalSearch } from "./search-runtime.mjs"

const REPO = fileURLToPath(new URL("../../", import.meta.url))
export const RUNTIME_SPEC = JSON.parse(
  fs.readFileSync(path.join(REPO, "data/research-runtime.json")),
)
const REQUIREMENTS = path.join(REPO, "integrations/research-worker/requirements.txt")
const VERSION_CODE =
  "import sys,json; print(json.dumps({'version':list(sys.version_info[:3]),'prefix':sys.prefix,'base_prefix':sys.base_prefix}))"

// Commands never run through a shell; output remains in a private, bounded log.
export function runtimeCommand(
  program,
  args,
  { cwd = REPO, log, timeoutMs = 900000, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const fd = log ? fs.openSync(log, "a", 0o600) : undefined
    let output = "",
      failure = null
    const child = spawn(program, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    const timer = setTimeout(() => {
      failure = Error("Runtime command timed out")
      child.kill("SIGKILL")
    }, timeoutMs)
    const collect = (bytes) => {
      if (fd !== undefined) fs.writeSync(fd, bytes)
      output = (output + bytes.toString()).slice(-65536)
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.once("error", (e) => {
      failure = e
    })
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      if (fd !== undefined) fs.closeSync(fd)
      if (failure || code !== 0)
        reject(failure || Error(`Runtime command failed (${code ?? signal}); inspect private log`))
      else resolve(output.trim())
    })
  })
}

export function runtimeInstallPlan({ root, python, searxCheckout, ocrModel }) {
  if (!root || !python || !path.isAbsolute(python) || !ocrModel)
    throw Error("Explicit private root, absolute Python 3.12 and verified OCR model required")
  root = path.resolve(root)
  safePath(root, "runtime/installation.json")
  if (searxCheckout) safePath(path.resolve(searxCheckout), "setup.py")
  const requirements = fs.readFileSync(REQUIREMENTS)
  const lines = requirements
    .toString()
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
  if (lines.some((l) => !/^[\w.-]+==[\w.]+$/.test(l)))
    throw Error("Exactly pinned worker requirements required")
  ocrModel = safePath(path.dirname(path.resolve(ocrModel)), path.basename(ocrModel))
  const model = fs.readFileSync(ocrModel)
  if (sha256(model) !== RUNTIME_SPEC.korean_ocr.sha256)
    throw Error("Korean OCR model hash mismatch")
  return {
    schema: "research-runtime-install-plan/v1",
    root,
    python,
    searx_checkout: searxCheckout ? path.resolve(searxCheckout) : null,
    ocr_model: path.resolve(ocrModel),
    ocr_sha256: sha256(model),
    requirements_sha256: sha256(requirements),
    packages: lines,
    spec: RUNTIME_SPEC,
    implementation_sha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
    runtime_only: true,
    schedules_changed: false,
    publication_requested: false,
  }
}

export async function installResearchRuntime(
  options,
  { command = runtimeCommand, emit = () => {} } = {},
) {
  const plan = runtimeInstallPlan(options),
    root = plan.root
  return withLock(root, "runtime-install", async () => {
    const inputFile = "runtime/installation.json",
      previous = readJSON(root, inputFile)
    const venv = safePath(root, "runtime/venv"),
      checkout = safePath(root, "runtime/searxng")
    if (previous && sha256(JSON.stringify(previous)) !== sha256(JSON.stringify(plan)))
      throw Error("Runtime installation input changed; use a separate private root")
    if (!previous && [venv, checkout].some((p) => fs.existsSync(p)))
      throw Error("Existing unmanaged runtime preserved; use a separate private root")
    const version = JSON.parse(await command(plan.python, ["-c", VERSION_CODE]))
    if (version.version?.slice(0, 2).join(".") !== plan.spec.python)
      throw Error("Python 3.12 required; system Python will not be replaced")
    if (!previous) atomicCreate(root, inputFile, plan)
    const state = new RunState(root, "runtime-install", plan)
    let reusedStages = 0,
      performedStages = 0
    const execute = async (stage, fn) => {
      const reused = state.state.stages[stage]?.status === "complete"
      const result = await state.stage(stage, { plan_sha256: sha256(JSON.stringify(plan)) }, fn)
      if (reused) reusedStages++
      else performedStages++
      emit({ stage, status: "complete", reused })
      return result
    }
    const run = (stage, program, args, settings = {}) => {
      const log = safePath(root, `runs/runtime-install/${stage}.log`)
      fs.mkdirSync(path.dirname(log), { recursive: true })
      return command(program, args, { ...settings, log })
    }
    await execute("python", async () => {
      await run("python", plan.python, ["-m", "venv", venv])
      return {
        python_version: version.version,
        config_sha256: sha256(fs.readFileSync(path.join(venv, "pyvenv.cfg"))),
      }
    })
    const expected = readJSON(root, "runs/runtime-install/python.json")
    if (sha256(fs.readFileSync(path.join(venv, "pyvenv.cfg"))) !== expected.config_sha256)
      throw Error("Installed Python environment changed")
    // Venv Python links to its verified base runtime by design.
    const installedPython = path.join(venv, "bin/python")
    await execute("sources", async () => {
      if (!fs.existsSync(path.join(checkout, ".git")))
        await run("sources", "git", [
          "clone",
          "--no-hardlinks",
          "--no-checkout",
          plan.searx_checkout || plan.spec.searx.repository,
          checkout,
        ])
      await run("sources", "git", ["-C", checkout, "checkout", "--detach", plan.spec.searx.commit])
      return { commit: (await run("sources", "git", ["-C", checkout, "rev-parse", "HEAD"])).trim() }
    })
    const head = (await command("git", ["-C", checkout, "rev-parse", "HEAD"])).trim()
    const dirty = (
      await command("git", ["-C", checkout, "status", "--porcelain", "--untracked-files=no"])
    ).trim()
    if (head !== plan.spec.searx.commit || dirty) throw Error("Pinned SearXNG source changed")
    await execute("worker_packages", async () => {
      await run("worker_packages", installedPython, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        ...plan.spec.build_packages,
        "-r",
        REQUIREMENTS,
      ])
      return { requirements_sha256: plan.requirements_sha256 }
    })
    await execute("search_packages", async () => {
      // SearXNG setup imports its own modules while generating package metadata.
      await run("search_packages", installedPython, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "-r",
        path.join(checkout, "requirements.txt"),
      ])
      await run("search_packages", installedPython, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-build-isolation",
        "--no-deps",
        checkout,
      ])
      return { searx_commit: head }
    })
    await execute("browser", async () => {
      await run("browser", installedPython, ["-m", "playwright", "install", "chromium"])
      return { browser: "chromium", installed: true }
    })
    await execute("ocr", async () => {
      const relative = plan.spec.korean_ocr.path
      const model = fs.readFileSync(plan.ocr_model)
      if (sha256(model) !== plan.ocr_sha256) throw Error("OCR source changed during installation")
      if (!fs.existsSync(safePath(root, relative))) atomicCreate(root, relative, model)
      return { path: relative, sha256: plan.ocr_sha256 }
    })
    if (sha256(fs.readFileSync(safePath(root, plan.spec.korean_ocr.path))) !== plan.ocr_sha256)
      throw Error("Installed OCR model changed")
    // Always recheck the actual environment. Completed install commands remain skipped.
    await run("verify", installedPython, ["-m", "pip", "check"])
    const packages = JSON.parse(
      await run("verify", installedPython, [
        "-c",
        "import json,importlib.metadata as m; from playwright.sync_api import sync_playwright; names=" +
          JSON.stringify([...plan.packages.map((p) => p.split("==")[0]), "searxng"]) +
          "; versions={n:m.version(n) for n in names};\nwith sync_playwright() as p:\n b=p.chromium.launch(headless=True); b.close()\nprint(json.dumps(versions))",
      ]),
    )
    for (const pkg of plan.packages) {
      const [name, version] = pkg.split("==")
      if (packages[name] !== version) throw Error("Worker dependency drift: " + name)
    }
    if (packages.searxng !== plan.spec.searx.version) throw Error("SearXNG version drift")
    return {
      schema: "research-runtime-install-receipt/v1",
      root,
      python: installedPython,
      packages,
      searx_commit: head,
      ocr_sha256: plan.ocr_sha256,
      reused_install_stages: reusedStages,
      performed_install_stages: performedStages,
      dependency_installation_verified: true,
      runtime_execution_verified: false,
      new_regular_operation_counted: false,
    }
  })
}

export async function verifyResearchRuntime({
  root,
  port = 8891,
  model = DEFAULT_LOCAL_OLLAMA_MODEL,
}) {
  const input = readJSON(root, "runtime/installation.json")
  if (!input || input.root !== path.resolve(root))
    throw Error("Owned runtime installation required")
  return withLock(root, "runtime-verification", async () => {
    const python = path.resolve(root, "runtime/venv/bin/python")
    const modelInfo = await new Ollama({ url: localOllamaURL(), timeout_ms: 20000 }).metadata(model)
    const search = await withLocalSearch(
      root,
      async (_, health) => ({ version: health.version, owner: health.owner, pid: health.pid }),
      { port, python },
    )
    const stopped = readJSON(root, "registry-state/search-service.json")
    if (stopped?.state !== "stopped" || stopped.pid !== search.pid)
      throw Error("Owned search shutdown not verified")
    return {
      schema: "research-runtime-execution-proof/v1",
      root: path.resolve(root),
      model: modelInfo.model,
      model_digest: modelInfo.digest,
      ollama_runtime: modelInfo.runtime,
      search,
      search_stopped: true,
      inference_calls: 0,
      article_approved: false,
      published: false,
    }
  })
}
