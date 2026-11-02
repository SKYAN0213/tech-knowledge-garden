import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { acquireLock, atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import { submitModuleJob, resumeModuleJob } from "../scripts/research/module-runtime.mjs"

function interrupted(t) {
  const f = fixture(t),
    round = "daily-interrupted-test",
    job = "module-interrupted-test",
    pin = { schema: "test-round-pin/v1", run_id: round },
    roundSHA = sha256(JSON.stringify(pin))
  atomicWrite(f.root, `operations/rounds/${round}/input.json`, pin)
  const input = {
    schema: "research-module-job-input/v1",
    job_id: job,
    module: "edition",
    operation: "advance",
    parameters: {
      run_id: round,
      daily_run: round,
      round: true,
      collect: true,
      stop_after_collection: true,
    },
    context: { ...f.ctx, operationalRound: { round_id: round, round_input_sha256: roundSHA } },
  }
  const state = {
    schema: "research-module-job/v1",
    job_id: job,
    input_sha256: sha256(JSON.stringify(input)),
    state: "running",
    attempt: 1,
    pid: 2147483646,
    queued_at: "2026-10-28T18:59:59.000Z",
    started_at: "2026-10-28T19:00:00.000Z",
  }
  atomicWrite(f.root, `module-jobs/${job}/input.json`, input)
  atomicWrite(f.root, `module-jobs/${job}/state.json`, state)
  const owner = {
    job_id: job,
    input_sha256: state.input_sha256,
    round_id: round,
    round_input_sha256: roundSHA,
  }
  const lock = (name, fields = {}) => {
    const record = {
      owner: crypto.randomUUID(),
      pid: state.pid,
      started_at: "2026-10-28T19:00:01.000Z",
      request_owner: owner,
      ...fields,
    }
    atomicWrite(f.root, `locks/${name}.json`, record)
    return record
  }
  return { ...f, round, job, input, state, owner, lock }
}

test("worker locks record their exact owning job and round without changing ordinary locks", (t) => {
  const f = interrupted(t)
  const release = withRequestOwner(f.owner, () => acquireLock(f.root, "collection-source-test"))
  assert.deepEqual(readJSON(f.root, "locks/collection-source-test.json").request_owner, f.owner)
  release()
  const ordinary = acquireLock(f.root, "ordinary-test")
  assert.equal(readJSON(f.root, "locks/ordinary-test.json").request_owner, undefined)
  ordinary()
})

test("interrupted collection recovers only its proven dead worker locks and preserves evidence", async (t) => {
  const f = interrupted(t)
  const names = [
    `round-workflow-${f.round}`,
    "garden-operation",
    "daily-acquisition",
    "collection-source-test",
    `run-${f.round}_source`,
    `source-${"a".repeat(20)}`,
    `host-${"b".repeat(32)}`,
    `module-worker-${f.job}`,
  ]
  const before = names.map((name) => ({
    name,
    record: f.lock(
      name,
      name.startsWith("module-worker-")
        ? { request_owner: undefined, started_at: f.state.started_at }
        : {},
    ),
  }))
  const unrelated = f.lock("run-unrelated", {
    pid: 2147483645,
    request_owner: { ...f.owner, job_id: "module-other" },
  })
  const { recoverInterruptedCollectionLocks } =
    await import("../scripts/research/module-runtime.mjs")
  assert.equal(typeof recoverInterruptedCollectionLocks, "function")
  const result = recoverInterruptedCollectionLocks(f.ctx, f.job)
  assert.deepEqual(new Set(result.recovered), new Set(names))
  for (const { name } of before)
    assert.equal(fs.existsSync(safePath(f.root, `locks/${name}.json`)), false)
  assert.deepEqual(readJSON(f.root, "locks/run-unrelated.json"), unrelated)
  const receipt = readJSON(f.root, result.receipt.path)
  assert.equal(
    sha256(fs.readFileSync(safePath(f.root, result.receipt.path))),
    result.receipt.sha256,
  )
  assert.equal(receipt.job_id, f.job)
  assert.equal(receipt.input_sha256, f.state.input_sha256)
  for (const item of receipt.locks) {
    const raw = Buffer.from(item.raw_base64, "base64")
    assert.equal(sha256(raw), item.sha256)
    assert.deepEqual(
      JSON.parse(raw),
      JSON.parse(JSON.stringify(before.find((row) => row.name === item.name).record)),
    )
  }
})

test("unknown or changed ownership preserves every lock and prevents recovery", async (t) => {
  const f = interrupted(t)
  const roundName = `round-workflow-${f.round}`
  const good = f.lock(roundName)
  const wrong = f.lock("daily-acquisition", {
    request_owner: { ...f.owner, input_sha256: "f".repeat(64) },
  })
  const { recoverInterruptedCollectionLocks } =
    await import("../scripts/research/module-runtime.mjs")
  assert.equal(typeof recoverInterruptedCollectionLocks, "function")
  assert.throws(() => recoverInterruptedCollectionLocks(f.ctx, f.job), /ownership|preserv/i)
  assert.deepEqual(readJSON(f.root, `locks/${roundName}.json`), good)
  assert.deepEqual(readJSON(f.root, "locks/daily-acquisition.json"), wrong)
})

test("live or legacy-unbound worker ownership never recovers a collection lock", async (t) => {
  const f = interrupted(t)
  const { recoverInterruptedCollectionLocks } =
    await import("../scripts/research/module-runtime.mjs")
  f.state.pid = process.pid
  atomicWrite(f.root, `module-jobs/${f.job}/state.json`, f.state)
  const live = f.lock("daily-acquisition")
  assert.throws(() => recoverInterruptedCollectionLocks(f.ctx, f.job), /active or unknown/)
  assert.deepEqual(readJSON(f.root, "locks/daily-acquisition.json"), live)
  f.state.pid = 2147483646
  atomicWrite(f.root, `module-jobs/${f.job}/state.json`, f.state)
  const legacy = f.lock("daily-acquisition", { request_owner: undefined })
  assert.throws(() => recoverInterruptedCollectionLocks(f.ctx, f.job), /ownership|preserv/i)
  assert.deepEqual(
    readJSON(f.root, "locks/daily-acquisition.json"),
    JSON.parse(JSON.stringify(legacy)),
  )
})

test("publication or unknown locks are never recovered by collection resume", async (t) => {
  const f = interrupted(t)
  const collection = f.lock("daily-acquisition")
  const publication = f.lock("publication-delivery-execute-some-run")
  const { recoverInterruptedCollectionLocks } =
    await import("../scripts/research/module-runtime.mjs")
  assert.throws(() => recoverInterruptedCollectionLocks(f.ctx, f.job), /ownership|preserv/i)
  assert.deepEqual(readJSON(f.root, "locks/daily-acquisition.json"), collection)
  assert.deepEqual(
    readJSON(f.root, "locks/publication-delivery-execute-some-run.json"),
    publication,
  )
})

test("a surviving child process prevents dead-parent lock recovery", async (t) => {
  const f = interrupted(t)
  const childCode =
    "const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); c.unref(); console.log(c.pid)"
  const parent = spawn(process.execPath, ["-e", childCode], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  })
  const group = parent.pid
  let output = ""
  parent.stdout.setEncoding("utf8")
  parent.stdout.on("data", (chunk) => {
    output += chunk
  })
  const exited = once(parent, "exit")
  try {
    await exited
    assert.ok(Number(output.trim()) > 0)
    f.state.pid = group
    atomicWrite(f.root, `module-jobs/${f.job}/state.json`, f.state)
    const saved = f.lock("garden-operation")
    const { recoverInterruptedCollectionLocks } =
      await import("../scripts/research/module-runtime.mjs")
    assert.throws(
      () => recoverInterruptedCollectionLocks(f.ctx, f.job),
      /process group remains active/,
    )
    assert.deepEqual(readJSON(f.root, "locks/garden-operation.json"), saved)
  } finally {
    try {
      process.kill(-group, "SIGTERM")
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
})

test("locks acquired by an actually terminated worker can be recovered with their original bytes", async (t) => {
  const f = interrupted(t)
  const runState = new URL("../scripts/research/run-state.mjs", import.meta.url).href
  const ownership = new URL("../scripts/research/request-ownership.mjs", import.meta.url).href
  const script = `import {acquireLock} from ${JSON.stringify(runState)}; import {withRequestOwner} from ${JSON.stringify(ownership)}; withRequestOwner(JSON.parse(process.argv[2]), () => { for (const name of ['round-workflow-'+process.argv[3], 'garden-operation', 'daily-acquisition']) acquireLock(process.argv[1], name); process.stdout.write('ready'); setInterval(() => {}, 1000) })`
  const worker = spawn(
    process.execPath,
    ["--input-type=module", "-e", script, f.root, JSON.stringify(f.owner), f.round],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const exited = once(worker, "exit")
  try {
    const [ready] = await Promise.race([
      once(worker.stdout, "data"),
      exited.then(() => {
        throw Error("Worker exited before acquiring its locks")
      }),
    ])
    assert.equal(String(ready), "ready")
    f.state.pid = worker.pid
    atomicWrite(f.root, `module-jobs/${f.job}/state.json`, f.state)
    const original = fs.readFileSync(safePath(f.root, "locks/daily-acquisition.json"))
    process.kill(worker.pid, "SIGKILL")
    await exited
    const { recoverInterruptedCollectionLocks } =
      await import("../scripts/research/module-runtime.mjs")
    const result = recoverInterruptedCollectionLocks(f.ctx, f.job)
    const receipt = readJSON(f.root, result.receipt.path)
    const daily = receipt.locks.find((lock) => lock.name === "daily-acquisition")
    assert.deepEqual(Buffer.from(daily.raw_base64, "base64"), original)
    assert.equal(fs.existsSync(safePath(f.root, "locks/daily-acquisition.json")), false)
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL")
  }
})

test("the regular resume path recovers owned collection locks before starting the same job", async (t) => {
  const f = fixture(t),
    round = "daily-resume-integration",
    job = "module-resume-integration"
  const pin = { schema: "test-round-pin/v1", run_id: round }
  atomicWrite(f.root, `operations/rounds/${round}/input.json`, pin)
  const binding = { round_id: round, round_input_sha256: sha256(JSON.stringify(pin)) }
  const ctx = { ...f.ctx, operationalRound: binding }
  const params = {
    run_id: round,
    daily_run: round,
    round: true,
    collect: true,
    stop_after_collection: true,
  }
  const first = await submitModuleJob(ctx, "edition", "advance", params, {
    jobId: job,
    background: false,
  })
  assert.equal(first.state, "failed") // The synthetic pin fails before any collection or network.
  const state = readJSON(f.root, `module-jobs/${job}/state.json`)
  const interruptedState = {
    ...state,
    state: "running",
    pid: 2147483646,
    queued_at: "2026-10-28T18:59:59.000Z",
    started_at: "2026-10-28T19:00:00.000Z",
  }
  atomicWrite(f.root, `module-jobs/${job}/state.json`, interruptedState)
  const owner = { job_id: job, input_sha256: state.input_sha256, ...binding }
  for (const name of [`round-workflow-${round}`, "garden-operation", "daily-acquisition"]) {
    atomicWrite(f.root, `locks/${name}.json`, {
      owner: crypto.randomUUID(),
      pid: interruptedState.pid,
      started_at: "2026-10-28T19:00:01.000Z",
      request_owner: owner,
    })
  }
  atomicWrite(f.root, `locks/module-worker-${job}.json`, {
    owner: crypto.randomUUID(),
    pid: interruptedState.pid,
    started_at: interruptedState.started_at,
  })
  const resumed = await resumeModuleJob(ctx, job, { background: false })
  assert.equal(resumed.attempt, 2)
  assert.equal(resumed.state, "failed") // The same synthetic pin still fails; no success is invented.
  assert.doesNotMatch(resumed.error || "", /EEXIST/)
  for (const name of [
    `round-workflow-${round}`,
    "garden-operation",
    "daily-acquisition",
    `module-worker-${job}`,
  ])
    assert.equal(fs.existsSync(safePath(f.root, `locks/${name}.json`)), false)
  const receipts = fs.readdirSync(safePath(f.root, `module-jobs/${job}/lock-recovery`))
  assert.equal(receipts.filter((name) => name.endsWith("-result.json")).length, 1)
})
