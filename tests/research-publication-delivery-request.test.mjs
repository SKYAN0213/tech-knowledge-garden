import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  stageAuthoringReadback,
  reconcileAuthoringExecution,
} from "../scripts/research/authoring-execution.mjs"
import {
  requestPublicationDelivery,
  executePublicationDelivery,
  submitPublicationDeliveryReceipt,
  publicationDeliveryStatus,
} from "../scripts/research/authoring-delivery-request.mjs"
import { module as publication } from "../scripts/research/modules/publication.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

async function pending(f) {
  for (let i = 0; i < 100; i++) {
    const status = publicationDeliveryStatus(f.ctx, { run_id: f.request.run_id })
    if (status.pending_request) return status.pending_request
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail("Native writer did not expose a connector request")
}
const response = (f, event, capture) => ({
  run_id: f.request.run_id,
  execution_id: event.execution_id,
  event_id: event.event_id,
  ...capture,
})
const intentCount = (f) => {
  const folder = safePath(f.root, "authoring-write-intents")
  return fs.existsSync(folder)
    ? fs
        .readdirSync(folder)
        .reduce((n, target) => n + fs.readdirSync(path.join(folder, target)).length, 0)
    : 0
}

test("publication delivery request pins native approval selection and never reports remote completion", async (t) => {
  const f = await deliveryFixture(t)
  const first = await requestPublicationDelivery(f.ctx, f.request)
  assert.equal(first.status, "release_required")
  assert.equal(first.drive_verified, false)
  assert.equal(first.public_verified, false)
  assert.deepEqual(first.approved_runs, ["writer"])
  const before = fs.readFileSync(safePath(f.root, first.request.path))
  const replay = await requestPublicationDelivery(f.ctx, f.request)
  assert.equal(replay.reused, true)
  assert.equal(before.equals(fs.readFileSync(safePath(f.root, first.request.path))), true)
  await assert.rejects(
    requestPublicationDelivery(f.ctx, { ...f.request, handoff_sha256: "0".repeat(64) }),
    /evidence changed/,
  )
  const status = publicationDeliveryStatus(f.ctx, { run_id: "unknown" })
  assert.equal(status.status, "request_pending")
  assert.equal(fs.existsSync(safePath(f.root, "runs/unknown")), false)
})

test("pre-intent cold storage waits preserve the exact delivery execution for hydrated resume", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const parameters = { ...f.deliver, execution_id: "cold-storage-resume" },
    path = "cold-storage/exact-payload.bin",
    payload = Buffer.from("verified cold payload\n")
  let writerCalls = 0
  const authoringWriter = async () => {
    writerCalls++
    if (writerCalls === 1)
      throw Object.assign(Error("Cold bytes must be hydrated"), {
        code: "STORAGE_PENDING",
        storage_request: {
          schema: "research-storage-download-request/v1",
          root: f.root,
          request_count: 1,
          requests: [{ path, sha256: sha256(payload), bytes: payload.length }],
        },
      })
    return { status: "verified_complete", drive_verified: true }
  }
  await assert.rejects(
    executePublicationDelivery(f.ctx, parameters, { authoringWriter }),
    (error) => error.code === "STORAGE_PENDING",
  )
  const statePath = `runs/${parameters.run_id}/publication-delivery/executions/${parameters.execution_id}/state.json`
  const waiting = readJSON(f.root, statePath)
  assert.equal(waiting.state, "waiting_for_storage")
  assert.equal(waiting.native_status, "storage_pending")
  assert.equal(waiting.pending_event, null)
  assert.equal(writerCalls, 1)

  await assert.rejects(
    executePublicationDelivery(f.ctx, parameters, { authoringWriter }),
    /new explicit execution ID/,
  )
  assert.equal(writerCalls, 1)
  f.put(path, payload)
  const result = await executePublicationDelivery(f.ctx, parameters, { authoringWriter })
  assert.equal(result.status, "verified_complete")
  assert.equal(writerCalls, 2)
  const resumed = readJSON(f.root, statePath)
  assert.equal(resumed.state, "completed")
  assert.equal(resumed.storage_recoveries.length, 1)
  assert.equal(resumed.storage_recoveries[0].request.requests[0].path, path)
})

test("cold storage after a native write intent remains recovery-required", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const parameters = { ...f.deliver, execution_id: "cold-storage-after-intent" },
    authoringWriter = async ({ emit }) => {
      emit({ type: "write_intent" })
      throw Object.assign(Error("Cold bytes required after intent"), {
        code: "STORAGE_PENDING",
        storage_request: { schema: "research-storage-download-request/v1" },
      })
    }
  await assert.rejects(
    executePublicationDelivery(f.ctx, parameters, { authoringWriter }),
    (error) => error.code === "STORAGE_PENDING",
  )
  const state = readJSON(
    f.root,
    `runs/${parameters.run_id}/publication-delivery/executions/${parameters.execution_id}/state.json`,
  )
  assert.equal(state.state, "failed")
  assert.equal(state.native_status, "recovery_required")
  assert.equal(state.pending_event, null)
  await assert.rejects(
    executePublicationDelivery(f.ctx, parameters, { authoringWriter }),
    /new explicit execution ID/,
  )
})

test("durable connector receipt reaches the native raw-byte verifier and completed calls reuse without writes", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const execution = executePublicationDelivery(f.ctx, f.deliver)
  const event = await pending(f)
  assert.equal(event.native_intent.type, "write_intent")
  assert.equal(event.native_intent.operation.action, "update")
  assert.equal(event.native_intent.operation.file_id, "existing")
  assert.ok(Date.parse(event.expires_at) <= Date.parse(event.native_intent.expires_at))
  assert.equal(intentCount(f), 1)
  const beforeReceipt = publicationDeliveryStatus(f.ctx, f.request)
  assert.equal(beforeReceipt.drive_verified, false)
  assert.equal(beforeReceipt.authoring.status, "write_outcome_unknown")
  const parameters = response(f, event, f.capture("captures/after.json", true))
  const submitted = await submitPublicationDeliveryReceipt(f.ctx, parameters)
  assert.equal(submitted.drive_verified, false)
  const result = await execution
  assert.equal(result.status, "verified_complete")
  assert.equal(result.native.status, "verified_complete")
  assert.equal(result.native.created_intents.length, 1)
  const status = publicationDeliveryStatus(f.ctx, f.request)
  assert.equal(status.drive_verified, true)
  assert.equal(status.public_verified, false)
  assert.equal(status.remote_current_verified, false)
  assert.equal(status.authoring.status, "verified_complete")
  assert.equal(status.pending_request, null)
  const replay = await executePublicationDelivery(f.ctx, f.deliver)
  assert.equal(replay.reused, true)
  assert.equal(intentCount(f), 1)
  const receiptReplay = await submitPublicationDeliveryReceipt(f.ctx, parameters)
  assert.equal(receiptReplay.reused, true)
  assert.equal(receiptReplay.receipt.sha256, submitted.receipt.sha256)
  await assert.rejects(
    submitPublicationDeliveryReceipt(f.ctx, {
      ...parameters,
      ...f.capture("captures/changed-response.json", true),
    }),
    /Connector response changed/,
  )
})

for (const explicit of [false, true])
  test(`connector capture preserves raw verification after ninety seconds with ${explicit ? "explicit ten-minute" : "default five-minute"} budget`, async (t) => {
    const f = await deliveryFixture(t)
    await requestPublicationDelivery(f.ctx, f.request)
    const parameters = { ...f.deliver, execution_id: explicit ? "ten-minute" : "five-minute" }
    if (explicit) parameters.wait_ms = 600000
    else delete parameters.wait_ms
    assert.doesNotThrow(() =>
      validateArguments(parameters, publication.operations.deliver.inputSchema, f.ctx),
    )
    const clock = { value: Date.now() }
    const execution = executePublicationDelivery(f.ctx, parameters, { now: () => clock.value })
    try {
      const event = await pending(f)
      assert.equal(
        Date.parse(event.expires_at),
        Math.min(
          clock.value + (explicit ? 600000 : 300000),
          Date.parse(event.native_intent.expires_at),
        ),
      )
      clock.value += 90000
      assert.ok(Date.parse(event.expires_at) > clock.value)
      await submitPublicationDeliveryReceipt(
        f.ctx,
        response(f, event, f.capture("captures/delayed-raw.json", true)),
      )
      const result = await execution
      assert.equal(result.native.status, "verified_complete")
      assert.equal(result.native.created_intents.length, 1)
      assert.equal(publicationDeliveryStatus(f.ctx, f.request).drive_verified, true)
    } finally {
      clock.value += 600001
      await execution.catch(() => {})
    }
  })

test("lost connector response preserves the native intent and reconciles actual bytes without a second request", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const failedParameters = { ...f.deliver, wait_ms: 20 }
  await assert.rejects(executePublicationDelivery(f.ctx, failedParameters), /outcome unknown/)
  assert.equal(intentCount(f), 1)
  const failed = publicationDeliveryStatus(f.ctx, f.request)
  assert.equal(failed.status, "recovery_required")
  assert.equal(failed.drive_verified, false)
  assert.equal(failed.pending_request, null)
  assert.ok(failed.interrupted_request)
  await assert.rejects(
    executePublicationDelivery(f.ctx, failedParameters),
    /new explicit execution ID/,
  )
  await assert.rejects(
    submitPublicationDeliveryReceipt(
      f.ctx,
      response(f, failed.interrupted_request, f.capture("captures/late.json", true)),
    ),
    /live matching/,
  )
  const unresolved = await executePublicationDelivery(f.ctx, {
    ...f.deliver,
    execution_id: "reconcile-before",
    ...f.capture("captures/still-before.json"),
  })
  assert.equal(unresolved.native.status, "write_outcome_unknown")
  assert.equal(intentCount(f), 1)
  const recovered = await executePublicationDelivery(f.ctx, {
    ...f.deliver,
    execution_id: "reconcile-after",
    ...f.capture("captures/recovered.json", true),
  })
  assert.equal(recovered.native.status, "verified_complete")
  assert.equal(recovered.native.created_intents.length, 0)
  assert.equal(recovered.native.recovered_intents.length, 1)
  assert.equal(intentCount(f), 1)
  assert.equal(publicationDeliveryStatus(f.ctx, f.request).drive_verified, true)
})

test("success-shaped connector JSON is not native raw proof and cannot mark delivery complete", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const execution = executePublicationDelivery(f.ctx, f.deliver)
  const rejected = assert.rejects(execution, /outcome unknown/)
  const event = await pending(f)
  const name = f.put("captures/api-success.json", { status: "success", drive_verified: true })
  const ref = f.ref(name)
  await submitPublicationDeliveryReceipt(
    f.ctx,
    response(f, event, {
      acquisition_path: ref.path,
      acquisition_sha256: ref.sha256,
    }),
  )
  await rejected
  const status = publicationDeliveryStatus(f.ctx, f.request)
  assert.equal(status.drive_verified, false)
  assert.equal(status.public_verified, false)
  assert.equal(intentCount(f), 1)
})

test("delivery status shows pending and conflicting native evidence without turning local worker completion into success", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const staged = await stageAuthoringReadback({
    root: f.root,
    releasePath: f.releasePath,
    acquisitionFile: safePath(f.root, f.deliver.acquisition_path),
  })
  await reconcileAuthoringExecution({
    root: f.root,
    releasePath: f.releasePath,
    observationFile: staged.observation_file,
    readbackFile: staged.readback_file,
  })
  const conflict = await executePublicationDelivery(f.ctx, {
    ...f.deliver,
    ...f.capture("captures/conflict.json", true, "someone else's change"),
  })
  assert.equal(conflict.native.status, "conflict")
  assert.equal(conflict.status, "conflict")
  const status = publicationDeliveryStatus(f.ctx, f.request)
  assert.equal(status.authoring.status, "conflict")
  assert.equal(status.authoring.counts.conflict, 1)
  assert.equal(status.drive_verified, false)
  assert.equal(status.public_verified, false)
  assert.equal(intentCount(f), 0)
})

test("exact release/hash/stage and bounded schemas reject implicit approvals, path escape and input changes before native execution", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  await assert.rejects(
    executePublicationDelivery(f.ctx, { ...f.deliver, release_sha256: "0".repeat(64) }),
    /evidence changed/,
  )
  await assert.rejects(
    executePublicationDelivery(f.ctx, { ...f.deliver, stage: "publication" }),
    /already verified authoring/,
  )
  await assert.rejects(
    executePublicationDelivery(f.ctx, { ...f.deliver, wait_ms: 600001 }),
    /bounded/,
  )
  const previewPath = "runs/reader/preview-manifest.json"
  const preview = readJSON(f.root, previewPath)
  preview.daily_editorial_handoff.sha256 = "0".repeat(64)
  f.put(previewPath, preview)
  await assert.rejects(
    executePublicationDelivery(f.ctx, f.deliver),
    /Approved release inputs changed/,
  )
  assert.equal(intentCount(f), 0)
  for (const parameters of [
    { ...f.request, handoff_path: "../outside.json" },
    { ...f.request, command: "publish" },
  ])
    assert.throws(() =>
      validateArguments(parameters, publication.operations.request_delivery.inputSchema, f.ctx),
    )
  assert.throws(() =>
    validateArguments(
      { ...f.deliver, retry_publish: true, approve: true },
      publication.operations.deliver.inputSchema,
      f.ctx,
    ),
  )
})

test("publication stage uses the existing Drive verification gate before any publisher command", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  let commands = 0
  const { acquisition_path, acquisition_sha256, ...parameters } = f.deliver
  await assert.rejects(
    executePublicationDelivery(
      f.ctx,
      { ...parameters, stage: "publication" },
      {
        deliveryOptions: {
          execute: async () => {
            commands++
            return ""
          },
        },
      },
    ),
    /Verified authoring raw readback/,
  )
  assert.equal(commands, 0)
  assert.equal(publicationDeliveryStatus(f.ctx, f.request).public_verified, false)
})
