import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { once } from "node:events"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  readOperationGate,
  moduleRecoveryPlan,
  DEVELOPMENT_CHECKS,
} from "../scripts/research/operation-policy.mjs"
import {
  moduleContext,
  submitModuleJob,
  resumeModuleJob,
  moduleJobStatus,
} from "../scripts/research/module-runtime.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { runLocalOperator } from "../integrations/research-mcp/operator.mjs"
import { implementationFiles, executionIdentity } from "../scripts/research/development-release.mjs"

const repo = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)))
const baseline = JSON.parse(fs.readFileSync(path.join(repo, "data/research-operation-policy.json")))

function policyFixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-operation-policy-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "data"))
  const save = (policy) =>
    fs.writeFileSync(path.join(root, "data/research-operation-policy.json"), JSON.stringify(policy))
  return { root, save }
}

function proof(f) {
  fs.mkdirSync(path.join(f.root, "scripts"), { recursive: true })
  fs.writeFileSync(
    path.join(f.root, "scripts/fixture-runtime.mjs"),
    "// Isolated gate protocol fixture only.\n",
  )
  const actual = ".local/research/unit-check.json"
  fs.mkdirSync(path.dirname(path.join(f.root, actual)), { recursive: true })
  fs.writeFileSync(path.join(f.root, actual), '{"fixture_only":true}')
  const evidenceRef = { path: actual, sha256: sha256(fs.readFileSync(path.join(f.root, actual))) }
  const manifestPath = ".local/.storage/releases/unit-test-fixture-only/manifest.json"
  const manifest = {
    schema: "research-development-release/v1",
    release_id: "unit-test-fixture-only",
    repo_root: f.root,
    execution_identity_sha256: sha256(JSON.stringify(executionIdentity(baseline))),
    files: implementationFiles(f.root).map((file) => ({
      path: file,
      sha256: sha256(fs.readFileSync(path.join(f.root, file))),
    })),
  }
  fs.mkdirSync(path.dirname(path.join(f.root, manifestPath)), { recursive: true })
  fs.writeFileSync(path.join(f.root, manifestPath), JSON.stringify(manifest))
  const evidence = {
    schema: "research-development-completion/v2",
    development_complete: true,
    executor: "codex",
    release_id: "unit-test-fixture-only",
    release_manifest: { path: manifestPath, sha256: sha256(JSON.stringify(manifest)) },
    checks: Object.fromEntries(
      DEVELOPMENT_CHECKS.map((key) => [key, { status: "passed", evidence: [evidenceRef] }]),
    ),
  }
  const relative = ".local/research/development-completion.json"
  const file = path.join(f.root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const bytes = JSON.stringify(evidence)
  fs.writeFileSync(file, bytes)
  return { evidence, file, ref: { path: relative, sha256: sha256(bytes) } }
}

test("missing development policy holds scheduled operation without creating a private store", (t) => {
  const f = policyFixture(t)
  const state = readOperationGate(f.root)
  assert.equal(state.regular_execution_allowed, false)
  assert.equal(state.expected_hold, true)
  assert.equal(state.source_requests, 0)
  assert.equal(fs.existsSync(path.join(f.root, ".local")), false)
})

test("development mode holds even when a historical completion record is present", (t) => {
  const f = policyFixture(t),
    p = proof(f)
  f.save({ ...baseline, phase: "development", development_completion: p.ref })
  const state = readOperationGate(f.root)
  assert.equal(state.status, "development_pending")
  assert.equal(state.regular_execution_allowed, false)
  assert.equal(state.default_executor, "codex")
  assert.equal(state.model_policies.ollama, "data/research-model-policy.json")
})

test("ready mode requires exact completion evidence and every required development check", (t) => {
  const f = policyFixture(t),
    p = proof(f)
  f.save({ ...baseline, phase: "ready", development_completion: null })
  assert.equal(readOperationGate(f.root).regular_execution_allowed, false)
  f.save({ ...baseline, phase: "ready", development_completion: p.ref })
  assert.equal(readOperationGate(f.root).regular_execution_allowed, true)
  fs.appendFileSync(p.file, " ")
  assert.equal(readOperationGate(f.root).reason, "development_evidence_changed")
  p.evidence.checks.storage_readback_resume.status = "pending"
  const bytes = JSON.stringify(p.evidence)
  fs.writeFileSync(p.file, bytes)
  f.save({
    ...baseline,
    phase: "ready",
    development_completion: { ...p.ref, sha256: sha256(bytes) },
  })
  assert.equal(readOperationGate(f.root).reason, "development_checks_incomplete")
})

test("the scheduled gate CLI reports development hold successfully with no execution artifacts", (t) => {
  const f = policyFixture(t)
  f.save({ ...baseline, phase: "development", development_completion: null })
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/research/operation-policy.mjs"), "status", "--repo", f.root],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).regular_execution_allowed, false)
  assert.equal(fs.existsSync(path.join(f.root, ".local")), false)
})

test("reasoning, storage, failed and completed jobs keep distinct explicit recovery actions", () => {
  const actions = {
    completed: "reuse_verified_result",
    waiting_for_storage: "hydrate_exact_payload_then_resume",
    waiting_for_reasoning: "resolve_exact_reasoning_task_then_resume",
    failed: "diagnose_saved_failure_then_resume",
  }
  for (const [state, action] of Object.entries(actions)) {
    const plan = moduleRecoveryPlan({ job_id: "module-test", state, worker_alive: false })
    assert.equal(plan.action, action)
    assert.equal(plan.automatic_retry, false)
    assert.equal(plan.preserve_completed, true)
  }
  assert.equal(
    moduleRecoveryPlan({ state: "running", worker_alive: true }).resume_after_resolution,
    false,
  )
  assert.equal(
    moduleRecoveryPlan({ state: "worker_status_unknown", worker_alive: null })
      .resume_after_resolution,
    false,
  )
})

test("regular local operation holds before model, MCP and private checkpoint creation", async (t) => {
  const f = policyFixture(t)
  f.save({ ...baseline, phase: "development", development_completion: null })
  for (const name of ["research-source-channels.json", "research-model-policy.json"])
    fs.copyFileSync(path.join(repo, "data", name), path.join(f.root, "data", name))
  const root = ".local/research/not-started"
  const result = await runLocalOperator(
    { repo: f.root, root, run: "regular-test", task: "Unit fixture only", regular: true },
    {
      planner: () => {
        throw Error("A development hold must not invoke a model")
      },
      client: {
        listTools: () => {
          throw Error("A development hold must not connect MCP")
        },
      },
    },
  )
  assert.equal(result.state, "development_pending")
  assert.equal(result.checkpoint, null)
  assert.equal(result.operation_gate.model_calls, 0)
  assert.equal(fs.existsSync(path.join(f.root, ".local")), false)
})

function nativeFixture(t) {
  const root = fs.mkdtempSync(path.join(repo, ".local/research/recovery-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, ".storage"))
  fs.writeFileSync(
    path.join(root, ".storage/policy.json"),
    JSON.stringify({ schema: "research-cold-storage/v1", root, enabled: false }),
  )
  return { root, ctx: moduleContext({ repo, root }) }
}

test("explicit resume preserves its failed attempt and recovers a saved result without repeating domain work", async (t) => {
  const f = nativeFixture(t),
    id = "module-recovery-history"
  const complete = await submitModuleJob(
    f.ctx,
    "collection",
    "inventory",
    {},
    { jobId: id, background: false },
  )
  assert.equal(complete.state, "completed")
  const statePath = `module-jobs/${id}/state.json`
  atomicWrite(f.root, statePath, {
    ...readJSON(f.root, statePath),
    state: "failed",
    error: "ENOSPC after saving result",
    error_code: "ENOSPC",
  })
  const before = fs.readFileSync(path.join(f.root, statePath))
  const resumed = await resumeModuleJob(f.ctx, id, { background: false })
  assert.equal(resumed.state, "completed")
  assert.equal(resumed.result_recovered, true)
  assert.deepEqual(resumed.result, complete.result)
  const history = readJSON(f.root, `module-jobs/${id}/attempts/000001-before-resume.json`)
  assert.equal(history.state.error_code, "ENOSPC")
  assert.equal(history.state_sha256, sha256(before))
  const same = await resumeModuleJob(f.ctx, id, { background: false })
  assert.equal(same.attempt, resumed.attempt)
  assert.equal(fs.readdirSync(path.join(f.root, `module-jobs/${id}/attempts`)).length, 1)
})

test("an inaccessible process table never becomes proof that a worker exited or permits another launch", async (t) => {
  const f = nativeFixture(t),
    id = "module-unknown-worker"
  const complete = await submitModuleJob(
    f.ctx,
    "collection",
    "inventory",
    {},
    { jobId: id, background: false },
  )
  assert.equal(complete.state, "completed")
  atomicWrite(f.root, `module-jobs/${id}/state.json`, {
    ...readJSON(f.root, `module-jobs/${id}/state.json`),
    state: "running",
    pid: process.pid,
  })
  const bin = path.join(f.root, "fake-bin")
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, "ps"), "#!/bin/sh\nexit 1\n", { mode: 0o700 })
  const code = `import { moduleJobStatus, resumeModuleJob } from ${JSON.stringify(new URL("../scripts/research/module-runtime.mjs", import.meta.url).href)}; const ctx=JSON.parse(process.argv[1]); const id=process.argv[2]; console.log(JSON.stringify({before:moduleJobStatus(ctx,id),after:await resumeModuleJob(ctx,id,{background:false})}));`
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code, JSON.stringify(f.ctx), id],
    { encoding: "utf8", env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } },
  )
  assert.equal(result.status, 0, result.stderr)
  const observed = JSON.parse(result.stdout)
  assert.equal(observed.before.state, "worker_status_unknown")
  assert.equal(observed.before.worker_alive, null)
  assert.equal(observed.before.resume_available, false)
  assert.equal(observed.before.recovery.action, "restore_process_visibility")
  assert.equal(observed.after.attempt, complete.attempt)
  assert.equal(fs.existsSync(path.join(f.root, `module-jobs/${id}/attempts`)), false)
})

test("a wide process-table read keeps a live worker with a long CI command line visible", async (t) => {
  const f = nativeFixture(t),
    id = "module-wide-worker"
  const complete = await submitModuleJob(
    f.ctx,
    "collection",
    "inventory",
    {},
    { jobId: id, background: false },
  )
  assert.equal(complete.state, "completed")
  atomicWrite(f.root, `module-jobs/${id}/state.json`, {
    ...readJSON(f.root, `module-jobs/${id}/state.json`),
    state: "running",
    pid: process.pid,
  })
  const bin = path.join(f.root, "wide-fake-bin"),
    worker = path.join(repo, "scripts/research-module-worker.mjs")
  fs.mkdirSync(bin)
  fs.writeFileSync(
    path.join(bin, "ps"),
    `#!/bin/sh\nif [ "$1" = "-ww" ]; then\n  printf '%s\\n' 'S ${worker} --repo ${repo} --root ${f.root} --job ${id}'\nelse\n  printf '%s\\n' 'S ${worker} --repo ${repo} --root ${f.root}'\nfi\n`,
    { mode: 0o700 },
  )
  const code = `import { moduleJobStatus } from ${JSON.stringify(new URL("../scripts/research/module-runtime.mjs", import.meta.url).href)}; const ctx=JSON.parse(process.argv[1]); const id=process.argv[2]; console.log(JSON.stringify(moduleJobStatus(ctx,id)));`
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code, JSON.stringify(f.ctx), id],
    { encoding: "utf8", env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } },
  )
  assert.equal(result.status, 0, result.stderr)
  const observed = JSON.parse(result.stdout)
  assert.equal(observed.state, "running")
  assert.equal(observed.worker_alive, true)
})

test("a live PID with an unmatched command line stays unknown and cannot be resumed", async (t) => {
  const f = nativeFixture(t),
    id = "module-unmatched-worker"
  const complete = await submitModuleJob(
    f.ctx,
    "collection",
    "inventory",
    {},
    { jobId: id, background: false },
  )
  atomicWrite(f.root, `module-jobs/${id}/state.json`, {
    ...readJSON(f.root, `module-jobs/${id}/state.json`),
    state: "running",
    pid: process.pid,
  })
  const bin = path.join(f.root, "unmatched-fake-bin")
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, "ps"), "#!/bin/sh\nprintf '%s\\n' 'node unrelated process'\n", {
    mode: 0o700,
  })
  const code = `import { moduleJobStatus, resumeModuleJob } from ${JSON.stringify(new URL("../scripts/research/module-runtime.mjs", import.meta.url).href)}; const ctx=JSON.parse(process.argv[1]); const id=process.argv[2]; console.log(JSON.stringify({before:moduleJobStatus(ctx,id),after:await resumeModuleJob(ctx,id,{background:false})}));`
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code, JSON.stringify(f.ctx), id],
    { encoding: "utf8", env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } },
  )
  assert.equal(result.status, 0, result.stderr)
  const observed = JSON.parse(result.stdout)
  assert.equal(observed.before.state, "worker_status_unknown")
  assert.equal(observed.before.worker_alive, null)
  assert.equal(observed.before.resume_available, false)
  assert.equal(observed.after.attempt, complete.attempt)
  assert.equal(readJSON(f.root, `module-jobs/${id}/state.json`).state, "running")
})

for (const finalState of ["completed", "failed", "waiting_for_reasoning", "waiting_for_storage"]) {
  for (const probe of ["ESRCH", "EPERM", "unmatched"]) {
    test(`status observes ${finalState} saved during a ${probe} worker probe`, async (t) => {
      const f = nativeFixture(t),
        id = `module-race-${finalState}-${probe}`
      const complete = await submitModuleJob(
        f.ctx,
        "collection",
        "inventory",
        {},
        {
          jobId: id,
          background: false,
        },
      )
      const statePath = `module-jobs/${id}/state.json`
      const final = {
        ...readJSON(f.root, statePath),
        state: finalState,
        error: finalState === "failed" ? "missing-review" : null,
      }
      atomicWrite(f.root, statePath, { ...final, state: "running", pid: process.pid })
      const originalKill = process.kill
      let probed = false
      try {
        process.kill = () => {
          probed = true
          atomicWrite(f.root, statePath, final)
          if (probe !== "unmatched") throw Object.assign(Error(probe), { code: probe })
          return true
        }
        const observed = moduleJobStatus(f.ctx, id)
        assert.equal(probed, true)
        assert.equal(observed.state, finalState)
        assert.equal(observed.worker_alive, false)
        assert.equal(observed.resume_available, finalState !== "completed")
        assert.equal(observed.error, final.error)
        assert.equal(observed.attempt, complete.attempt)
        assert.equal(fs.existsSync(path.join(f.root, `module-jobs/${id}/attempts`)), false)
      } finally {
        process.kill = originalKill
      }
    })
  }
}

for (const transition of ["active", "invalid-sha", "foreign-context"]) {
  test(`a worker probe keeps ${transition} fail closed`, async (t) => {
    const f = nativeFixture(t),
      id = `module-race-${transition}`
    await submitModuleJob(f.ctx, "collection", "inventory", {}, { jobId: id, background: false })
    const statePath = `module-jobs/${id}/state.json`
    const final = readJSON(f.root, statePath)
    atomicWrite(f.root, statePath, { ...final, state: "running", pid: process.pid })
    const originalKill = process.kill
    try {
      process.kill = () => {
        if (transition === "invalid-sha") {
          atomicWrite(f.root, statePath, { ...final, input_sha256: "invalid" })
        } else if (transition === "foreign-context") {
          const inputPath = `module-jobs/${id}/input.json`
          const input = readJSON(f.root, inputPath)
          input.context.repo = f.root
          atomicWrite(f.root, inputPath, input)
          atomicWrite(f.root, statePath, { ...final, input_sha256: sha256(JSON.stringify(input)) })
        }
        throw Object.assign(Error("permission denied"), { code: "EPERM" })
      }
      if (transition === "active") {
        const observed = moduleJobStatus(f.ctx, id)
        assert.equal(observed.state, "worker_status_unknown")
        assert.equal(observed.worker_alive, null)
        assert.equal(observed.resume_available, false)
      } else {
        assert.throws(() => moduleJobStatus(f.ctx, id), /input or context changed/)
      }
    } finally {
      process.kill = originalKill
    }
  })
}

function workerProbeFixture(t, id, pid = process.pid) {
  const f = nativeFixture(t)
  const input = { job_id: id, module: "collection", operation: "inventory", context: f.ctx }
  const state = {
    schema: "research-module-job/v1",
    job_id: id,
    input_sha256: sha256(JSON.stringify(input)),
    state: "finishing",
    pid: null,
    attempt: 1,
  }
  atomicWrite(f.root, `module-jobs/${id}/input.json`, input)
  atomicWrite(f.root, `module-jobs/${id}/state.json`, state)
  atomicWrite(f.root, `module-jobs/${id}/launch.json`, { pid })
  return { ...f, id, pid, state }
}

const probeCases = [
  {
    name: "vanished after failed ps",
    ps: null,
    second: "ESRCH",
    expected: "interrupted",
    calls: 2,
  },
  {
    name: "vanished after unmatched ps",
    ps: "S node unrelated",
    second: "ESRCH",
    expected: "interrupted",
    calls: 2,
  },
  {
    name: "permission denied after failed ps",
    ps: null,
    second: "EPERM",
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "unknown error after failed ps",
    ps: null,
    second: "EIO",
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "still alive after failed ps",
    ps: null,
    second: null,
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "another live job with the same ID prefix",
    ps: "S MATCHED_WORKER-extra",
    second: null,
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "reused live PID",
    ps: "Ss node unrelated",
    second: null,
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "defunct text in live argv",
    ps: "S node --label <defunct>",
    second: null,
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "malformed stat",
    ps: "Zombie node",
    second: null,
    expected: "worker_status_unknown",
    calls: 2,
  },
  {
    name: "kernel zombie with flags",
    ps: "  Z+   [node] <defunct>",
    second: null,
    expected: "interrupted",
    calls: 1,
  },
  {
    name: "Linux kernel dead",
    ps: "X [node]",
    platform: "linux",
    second: null,
    expected: "interrupted",
    calls: 1,
  },
  { name: "missing stat", ps: "", second: null, expected: "worker_status_unknown", calls: 2 },
  {
    name: "Darwin debug flag on a live worker",
    ps: "SX MATCHED_WORKER",
    platform: "darwin",
    second: null,
    expected: "finishing",
    calls: 1,
  },
  {
    name: "Linux flags on a live worker",
    ps: "Sl+ MATCHED_WORKER",
    platform: "linux",
    second: null,
    expected: "finishing",
    calls: 1,
  },
  {
    name: "initial EPERM",
    ps: "Z [node]",
    initial: "EPERM",
    second: "ESRCH",
    expected: "worker_status_unknown",
    calls: 1,
  },
]
for (const example of probeCases) {
  test(`worker visibility handles ${example.name} using observed process evidence`, (t) => {
    const f = workerProbeFixture(t, "module-process-evidence")
    const bin = path.join(f.root, "probe-bin")
    fs.mkdirSync(bin)
    fs.writeFileSync(
      path.join(bin, "ps"),
      example.ps === null
        ? "#!/bin/sh\nexit 1\n"
        : `#!/bin/sh\nif [ "$5" != "stat=" ] || [ "$6" != "-o" ] || [ "$7" != "command=" ]; then printf '%s\\n' 'malformed old ps contract'; exit 0; fi\nprintf '%s\\n' '${example.ps?.replace("MATCHED_WORKER", path.join(repo, "scripts/research-module-worker.mjs") + " --job " + f.id)}'\n`,
      { mode: 0o700 },
    )
    const code = `import { moduleJobStatus } from ${JSON.stringify(new URL("../scripts/research/module-runtime.mjs", import.meta.url).href)}; const ctx=JSON.parse(process.argv[1]); const example=JSON.parse(process.argv[2]); if(example.platform)Object.defineProperty(process,"platform",{value:example.platform});let probes=0;process.kill=()=>{probes++;const code=probes===1?example.initial:example.second;if(code)throw Object.assign(Error(code),{code});return true};const status=moduleJobStatus(ctx,"module-process-evidence");console.log(JSON.stringify({status,probes}));`
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code, JSON.stringify(f.ctx), JSON.stringify(example)],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
      },
    )
    assert.equal(result.status, 0, result.stderr)
    const { status, probes } = JSON.parse(result.stdout)
    assert.equal(status.state, example.expected)
    assert.equal(probes, example.calls)
    assert.equal(
      status.worker_alive,
      example.expected === "interrupted" ? false : example.expected === "finishing" ? true : null,
    )
    assert.equal(status.resume_available, example.expected === "interrupted")
    assert.equal(status.recovery.automatic_retry, false)
    assert.equal(readJSON(f.root, `module-jobs/${f.id}/state.json`).state, "finishing")
    assert.equal(fs.existsSync(path.join(f.root, `module-jobs/${f.id}/attempts`)), false)
  })
}

test(
  "native zombie workers cannot remain writers while their parent has not reaped them",
  {
    skip: !["linux", "darwin"].includes(process.platform),
  },
  async (t) => {
    const program = `import ctypes,json,os,sys
pid=os.fork()
if pid==0:os._exit(0)
try:
 if hasattr(os,"waitid"):os.waitid(os.P_PID,pid,os.WEXITED|os.WNOWAIT)
 else:
  libc=ctypes.CDLL(None,use_errno=True);waitid=libc.waitid;waitid.argtypes=[ctypes.c_int,ctypes.c_uint,ctypes.c_void_p,ctypes.c_int];info=ctypes.create_string_buffer(256)
  if waitid(1,pid,ctypes.byref(info),os.WEXITED|os.WNOWAIT)!=0:raise OSError(ctypes.get_errno(),"waitid failed")
 print(json.dumps({"pid":pid}),flush=True)
 sys.stdin.readline()
finally:os.waitpid(pid,0)`
    const child = spawn("python3", ["-u", "-c", program], { stdio: ["pipe", "pipe", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (data) => {
      stderr += data
    })
    const ready = await new Promise((resolve, reject) => {
      child.stdout.once("data", (data) => resolve(JSON.parse(data.toString())))
      child.once("error", reject)
      child.once("exit", (code) => reject(Error(`Zombie fixture exited ${code}: ${stderr}`)))
    })
    try {
      const f = workerProbeFixture(t, "module-native-zombie", ready.pid)
      assert.doesNotThrow(() => process.kill(ready.pid, 0))
      const native = spawnSync(
        "ps",
        ["-ww", "-p", String(ready.pid), "-o", "stat=", "-o", "command="],
        { encoding: "utf8" },
      )
      assert.equal(native.status, 0, native.stderr)
      assert.match(native.stdout.trim(), /^Z/)
      const status = moduleJobStatus(f.ctx, f.id)
      assert.equal(status.state, "interrupted")
      assert.equal(status.worker_alive, false)
      assert.equal(status.recovery.automatic_retry, false)
    } finally {
      const exited = once(child, "exit")
      child.stdin.end("reap\n")
      await exited
    }
  },
)
