import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fixture } from "./fixtures/publication-operation.mjs"
import {
  deliverApprovedPublication,
  deliveryCheckpointStatus,
} from "../scripts/research/delivery-run.mjs"
import {
  preparePublicationOperation,
  publicationOperationStatus,
  recordPublicationPush,
} from "../scripts/research/publication-operation.mjs"

const proof = (f) => ({ ...f.deployment, workflowName: "Publish Garden" })
const ready = (f) => [
  { databaseId: 123, headSha: f.push.local_commit, workflowName: "Publish Garden" },
]
const options = (f) => ({ ...f.options, releasePath: f.releasePath, fetchImpl: f.fetchImpl })

test("delivery rejects stale or unapproved authoring before executing any command", async (t) => {
  const f = await fixture(t)
  let commands = 0
  await assert.rejects(
    deliverApprovedPublication({
      ...options(f),
      now: () => f.now + 600001,
      execute: async () => {
        commands++
      },
    }),
    /Fresh authoring/,
  )
  assert.equal(commands, 0)
  assert.equal(fs.existsSync(path.join(f.root, "runs/operation/delivery/input.json")), false)
})

test("single delivery resumes pending CI without a second push, then reuses every completed proof", async (t) => {
  const f = await fixture(t, ".local/research/local-ai")
  let pushes = 0,
    deployed = false,
    queries = 0
  const execute = async (file, args) => {
    if (file === process.execPath) {
      pushes++
      assert.deepEqual(args.slice(0, 3), ["scripts/publish.mjs", "--operation", f.run])
      await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
      return ""
    }
    assert.equal(file, "gh")
    queries++
    return JSON.stringify(args[1] === "list" ? (deployed ? ready(f) : []) : proof(f))
  }
  const first = await deliverApprovedPublication({ ...options(f), execute })
  assert.equal(first.status, "waiting_deployment")
  assert.equal(pushes, 1)
  deployed = true
  const complete = await deliverApprovedPublication({ ...options(f), execute })
  assert.equal(complete.status, "public_bytes_verified")
  assert.equal(complete.new_regular_operation_counted, false)
  assert.equal(complete.website_data_verified, false)
  assert.equal(complete.source_archive_verified, false)
  assert.equal(publicationOperationStatus(f.options).status, "public_bytes_verified")
  const count = [pushes, queries, f.calls()]
  // Later documentation commits must not force publication of the old edition.
  f.put("docs/example.md", "next checkpoint")
  f.git("add", "docs")
  f.git("commit", "-qm", "Documentation only")
  const again = await deliverApprovedPublication({ ...options(f), execute })
  assert.equal(again.status, "public_bytes_verified")
  assert.deepEqual([pushes, queries, f.calls()], count)
  assert.deepEqual(again.reused, ["publication", "deployment", "public_readback"])
})

test("unknown publication outcome persists an intent and requires explicit recovery instead of automatic retry", async (t) => {
  const f = await fixture(t, ".local/research/local-ai")
  let calls = 0
  const execute = async () => {
    calls++
    throw Error("response lost")
  }
  const first = await deliverApprovedPublication({ ...options(f), execute })
  assert.equal(first.status, "publication_recovery_required")
  const again = await deliverApprovedPublication({ ...options(f), execute })
  assert.equal(again.status, "publication_recovery_required")
  assert.equal(calls, 1)
  const recovered = await deliverApprovedPublication({
    ...options(f),
    retryPublish: true,
    execute: async (file) => {
      if (file === process.execPath) {
        calls++
        await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
        throw Error("native push receipt exists despite lost command response")
      }
      return "[]"
    },
  })
  assert.equal(recovered.status, "waiting_deployment")
  assert.equal(calls, 2)
})

test("delivery does not select between workflow reruns or accept an unrelated workflow", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  const ambiguous = await deliverApprovedPublication({
    ...options(f),
    execute: async () => JSON.stringify([...ready(f), { ...ready(f)[0], databaseId: 456 }]),
  })
  assert.equal(ambiguous.status, "deployment_selection_required")
  assert.equal(f.calls(), 0)
  await assert.rejects(
    deliverApprovedPublication({
      ...options(f),
      actionsRun: "123",
      execute: async () => JSON.stringify({ ...proof(f), workflowName: "Drive Sync" }),
    }),
    /identity differs/,
  )
  assert.equal(
    fs.existsSync(path.join(f.root, "runs/operation/delivery/actions-selection.json")),
    false,
  )
})

test("failed deployment remains failed and network observation failure cannot become success", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  const inaccessible = await deliverApprovedPublication({
    ...options(f),
    execute: async () => {
      throw Error("offline")
    },
  })
  assert.equal(inaccessible.status, "deployment_observation_failed")
  const failed = await deliverApprovedPublication({
    ...options(f),
    actionsRun: "123",
    execute: async () => JSON.stringify({ ...proof(f), conclusion: "failure", jobs: [] }),
  })
  assert.equal(failed.status, "deployment_failed")
  assert.equal(f.calls(), 0)
  assert.equal(publicationOperationStatus(f.options).status, "remote_confirmed")
  await assert.rejects(
    deliverApprovedPublication({
      ...options(f),
      actionsRun: "456",
      execute: async () => JSON.stringify(proof(f)),
    }),
    /selection changed/,
  )
})

test("delivery validates raw authoring and pinned release on every resume; status does not mutate or query", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  const snapshot = fs.readdirSync(path.join(f.root, "runs/operation"))
  const status = await deliverApprovedPublication({
    ...options(f),
    statusOnly: true,
    execute: async () => {
      throw Error("Must not execute")
    },
  })
  assert.equal(status.status, "remote_confirmed")
  assert.deepEqual(fs.readdirSync(path.join(f.root, "runs/operation")), snapshot)
  fs.writeFileSync(path.join(f.root, path.dirname(f.execution.receipt), "raw/0.bin"), "changed")
  await assert.rejects(
    deliverApprovedPublication({
      ...options(f),
      execute: async () => {
        throw Error("Must not execute")
      },
    }),
    /raw|readback|changed|hash/i,
  )
})

test("a partial public readback resumes missing files only, with no second publication or deployment selection", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  let http = 0,
    commands = 0
  const interrupted = await deliverApprovedPublication({
    ...options(f),
    actionsRun: "123",
    execute: async () => {
      commands++
      return JSON.stringify(proof(f))
    },
    fetchImpl: async (url) => {
      if (++http === 3) throw Error("network lost")
      return f.fetchImpl(url)
    },
  })
  assert.equal(interrupted.status, "public_readback_failed")
  const completed = f.calls()
  const result = await deliverApprovedPublication({
    ...options(f),
    execute: async () => {
      throw Error("No command should repeat")
    },
  })
  assert.equal(result.status, "public_bytes_verified")
  assert.equal(commands, 1)
  assert.ok(completed > 0)
  assert.equal(f.calls(), f.expectedReadbackCalls)
})

test("bounded CI polling continues to public verification without republishing", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  let time = Date.now(),
    views = 0,
    lists = 0,
    sleeps = 0
  const result = await deliverApprovedPublication({
    ...options(f),
    waitSeconds: 20,
    now: () => time,
    sleep: async (ms) => {
      assert.ok(ms <= 10000)
      sleeps++
      time += ms
    },
    execute: async (file, args) => {
      assert.equal(file, "gh")
      if (args[1] === "list") {
        lists++
        return JSON.stringify(ready(f))
      }
      return JSON.stringify(
        ++views === 1 ? { ...proof(f), status: "in_progress", conclusion: null } : proof(f),
      )
    },
  })
  assert.equal(result.status, "public_bytes_verified")
  assert.equal(lists, 1)
  assert.equal(views, 2)
  assert.equal(sleeps, 1)
})

test("overlapping controllers cannot publish the same run twice", async (t) => {
  const f = await fixture(t, ".local/research/local-ai")
  let releaseCommand, enteredCommand
  const entered = new Promise((resolve) => {
    enteredCommand = resolve
  })
  const gate = new Promise((resolve) => {
    releaseCommand = resolve
  })
  const first = deliverApprovedPublication({
    ...options(f),
    execute: async (file) => {
      if (file === process.execPath) {
        enteredCommand()
        await gate
        return ""
      }
      return "[]"
    },
  })
  await entered
  await assert.rejects(deliverApprovedPublication(options(f)), /EEXIST/)
  releaseCommand()
  assert.equal((await first).status, "publication_recovery_required")
})

test("a changed release cannot reuse the previous delivery ID", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  await deliverApprovedPublication({ ...options(f), execute: async () => "[]" })
  fs.appendFileSync(path.join(f.root, f.releasePath), " ")
  await assert.rejects(
    deliverApprovedPublication({
      ...options(f),
      execute: async () => {
        throw Error("Must not execute")
      },
    }),
    /input changed/,
  )
})

test("integrated progress exposes pending delivery without treating checkpoints as approval evidence", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  await deliverApprovedPublication({ ...options(f), execute: async () => "[]" })
  const operations = { runs: [publicationOperationStatus(f.options)] }
  const before = fs.readFileSync(path.join(f.root, "runs/operation/delivery/latest.json"))
  const progress = deliveryCheckpointStatus(f.root, operations)
  assert.equal(progress.runs[0].status, "waiting_deployment")
  assert.equal(progress.runs[0].publication_status, "remote_confirmed")
  assert.equal(progress.runs[0].new_regular_operation_counted, false)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/operation/delivery/latest.json")),
    before,
  )
  const changed = JSON.parse(before)
  changed.status = "public_bytes_verified"
  f.privatePut("runs/operation/delivery/latest.json", changed)
  assert.equal(deliveryCheckpointStatus(f.root, operations).runs[0].status, "invalid")
})
