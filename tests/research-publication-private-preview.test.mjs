import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  requestPublicationDelivery,
  publicationDeliveryStatus,
} from "../scripts/research/authoring-delivery-request.mjs"
import { module as publication } from "../scripts/research/modules/publication.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

// Only the renderer is stubbed here. The fixture's original evidence, facts,
// editorial approval, event handoff and current native preflight remain real.
// These disposable reader files never count as an operational preview/receipt.
function fixtureRenderer(f, { wrongSelection = false } = {}) {
  let calls = 0
  const run = async (root, previewRun, approvedRuns, options) => {
    calls++
    assert.equal(root, f.root)
    assert.deepEqual(approvedRuns, [])
    assert.equal(options.publicationHandoff, f.request.handoff_path)
    const article = readJSON(root, "runs/writer/approved-article.json")
    const workspace = `runs/${previewRun}/preview-workspace`
    const content = JSON.stringify({
      event_id: article.event_id,
      original_date: article.article_review.published_at,
      title: article.title,
      sources: article.source_urls,
    })
    const output = (directory, relative) => {
      atomicWrite(root, `${workspace}/${directory}/${relative}`, content)
      return { path: relative, sha256: sha256(content) }
    }
    const manifest = {
      schema: "private-reader-preview/v1",
      run_id: previewRun,
      workspace,
      approved_runs: wrongSelection ? ["other-writer"] : ["writer"],
      knowledge_runs: [],
      daily_editorial_handoff: {
        path: f.request.handoff_path,
        sha256: f.request.handoff_sha256,
      },
      ...(options.editionSpec ? { edition_spec: options.editionSpec } : {}),
      editions: [output("vault", "Editions/2026/09/fixture.md")],
      knowledge: [],
      public: [output("public", "news/abcdef0123456789.html")],
      digest: [output("digest", "2026/09/fixture.md")],
      consistency: { articles: [{ event_id: article.event_id }] },
      candidate_published: false,
      drive_verified: false,
      browser_verified: false,
    }
    atomicWrite(root, `runs/${previewRun}/preview-manifest.json`, manifest)
  }
  return {
    run,
    get calls() {
      return calls
    },
  }
}

const previewParameters = (f) => ({ ...f.request, preview_run_id: "delivery-private-preview" })

test("request_delivery prepares exact private native outputs and reuses them without renderer or release", async (t) => {
  const f = await deliveryFixture(t)
  const old = await requestPublicationDelivery(f.ctx, f.request)
  const requestBytes = fs.readFileSync(safePath(f.root, old.request.path))
  const renderer = fixtureRenderer(f)
  const parameters = previewParameters(f)
  validateArguments(parameters, publication.operations.request_delivery.inputSchema, f.ctx)
  assert.equal(publication.operations.request_delivery.model, false)
  assert.equal(publication.operations.request_delivery.network, false)
  const first = await requestPublicationDelivery(f.ctx, parameters, { previewRunner: renderer.run })
  assert.equal(renderer.calls, 1)
  assert.equal(first.status, "release_required")
  assert.equal(first.private_preview.status, "ready_for_explicit_review")
  assert.equal(first.private_preview.exact_outputs_verified, true)
  assert.equal(first.preview_reused, false)
  assert.equal(first.reused, true)
  assert.equal(first.binding, null)
  assert.equal(first.drive_verified, false)
  assert.equal(first.public_verified, false)
  assert.equal(first.new_regular_operation_counted, false)
  assert.equal(requestBytes.equals(fs.readFileSync(safePath(f.root, old.request.path))), true)
  const spec = readJSON(f.root, first.private_preview.input.path)
  assert.deepEqual(spec.request, old.request)
  assert.deepEqual(spec.handoff, old.handoff)
  assert.equal(spec.approval_basis.articles[0].run_id, "writer")
  assert.equal(
    spec.approval_basis.articles[0].files["approved-article.json"],
    f.ref("runs/writer/approved-article.json").sha256,
  )
  const manifestBytes = fs.readFileSync(safePath(f.root, first.private_preview.manifest.path))
  const replay = await requestPublicationDelivery(f.ctx, parameters, {
    previewRunner: renderer.run,
  })
  assert.equal(renderer.calls, 1)
  assert.equal(replay.preview_reused, true)
  assert.equal(
    manifestBytes.equals(fs.readFileSync(safePath(f.root, replay.private_preview.manifest.path))),
    true,
  )
  const manifest = JSON.parse(manifestBytes)
  atomicWrite(f.root, `${manifest.workspace}/public/${manifest.public[0].path}`, "changed")
  await assert.rejects(
    requestPublicationDelivery(f.ctx, parameters, { previewRunner: renderer.run }),
    /output bytes changed/,
  )
  assert.equal(renderer.calls, 1)
  assert.equal(
    manifestBytes.equals(fs.readFileSync(safePath(f.root, first.private_preview.manifest.path))),
    true,
  )
})

test("private preview rejects unpinned specifications, foreign paths and changed request selection before rendering", async (t) => {
  const f = await deliveryFixture(t)
  const renderer = fixtureRenderer(f)
  const parameters = previewParameters(f)
  const withSpec = { ...parameters, edition_spec_path: "inputs/edition.json" }
  await assert.rejects(
    requestPublicationDelivery(f.ctx, withSpec, { previewRunner: renderer.run }),
    /exact path\/SHA/,
  )
  f.put("inputs/edition.json", { schema: "research-private-edition/v1", intent: "private_slice" })
  await assert.rejects(
    requestPublicationDelivery(
      f.ctx,
      { ...withSpec, edition_spec_sha256: "0".repeat(64) },
      { previewRunner: renderer.run },
    ),
    /evidence changed/,
  )
  await assert.rejects(
    requestPublicationDelivery(
      f.ctx,
      {
        ...f.request,
        edition_spec_path: "inputs/edition.json",
        edition_spec_sha256: f.ref("inputs/edition.json").sha256,
      },
      { previewRunner: renderer.run },
    ),
    /requires a private preview run/,
  )
  f.put("inputs/invalid-edition.json", null)
  await assert.rejects(
    requestPublicationDelivery(
      f.ctx,
      {
        ...parameters,
        edition_spec_path: "inputs/invalid-edition.json",
        edition_spec_sha256: f.ref("inputs/invalid-edition.json").sha256,
      },
      { previewRunner: renderer.run },
    ),
    /native private edition specification/,
  )
  assert.throws(
    () =>
      validateArguments(
        { ...withSpec, edition_spec_path: "../outside.json" },
        publication.operations.request_delivery.inputSchema,
        f.ctx,
      ),
    /escapes working root/,
  )
  assert.throws(
    () =>
      validateArguments(
        { ...parameters, previewRunner: "arbitrary-command" },
        publication.operations.request_delivery.inputSchema,
        f.ctx,
      ),
    /Unknown module field/,
  )
  await assert.rejects(
    requestPublicationDelivery(
      f.ctx,
      { ...parameters, handoff_sha256: "0".repeat(64) },
      { previewRunner: renderer.run },
    ),
    /evidence changed/,
  )
  assert.equal(renderer.calls, 0)
  assert.equal(
    fs.existsSync(safePath(f.root, "runs/delivery/publication-delivery/input.json")),
    false,
  )
})

test("private preview cannot approve a mismatched candidate or erase the original delivery failure", async (t) => {
  const f = await deliveryFixture(t)
  await requestPublicationDelivery(f.ctx, f.request)
  const directory = "runs/delivery/publication-delivery"
  const original = readJSON(f.root, directory + "/input.json")
  const failedSpec = {
    schema: "research-publication-delivery-execution-input/v1",
    run_id: "delivery",
    execution_id: "original-failure",
    request_sha256: sha256(JSON.stringify(original)),
    binding_sha256: sha256(JSON.stringify(null)),
  }
  const failedState = {
    input_sha256: sha256(JSON.stringify(failedSpec)),
    state: "failed",
    native_status: "recovery_required",
    error: "retained original failure",
  }
  f.put(directory + "/executions/original-failure/input.json", failedSpec)
  f.put(directory + "/executions/original-failure/state.json", failedState)
  f.put(directory + "/latest.json", {
    execution_id: failedSpec.execution_id,
    input_sha256: failedState.input_sha256,
  })
  const latestBefore = fs.readFileSync(safePath(f.root, directory + "/latest.json"))
  const failureBefore = fs.readFileSync(
    safePath(f.root, directory + "/executions/original-failure/state.json"),
  )
  const renderer = fixtureRenderer(f, { wrongSelection: true })
  await assert.rejects(
    requestPublicationDelivery(f.ctx, previewParameters(f), { previewRunner: renderer.run }),
    /exact delivery request and native approvals/,
  )
  const status = publicationDeliveryStatus(f.ctx, f.request)
  assert.equal(status.status, "recovery_required")
  assert.equal(status.execution.error, "retained original failure")
  assert.equal(status.private_preview.status, "preview_failed")
  assert.equal(status.private_preview.manifest, null)
  assert.equal(status.drive_verified, false)
  assert.equal(status.public_verified, false)
  assert.equal(
    latestBefore.equals(fs.readFileSync(safePath(f.root, directory + "/latest.json"))),
    true,
  )
  assert.equal(
    failureBefore.equals(
      fs.readFileSync(safePath(f.root, directory + "/executions/original-failure/state.json")),
    ),
    true,
  )
  await assert.rejects(
    requestPublicationDelivery(
      f.ctx,
      { ...previewParameters(f), preview_run_id: "replacement-preview" },
      { previewRunner: renderer.run },
    ),
    /selection changed/,
  )
  assert.equal(renderer.calls, 1)
  assert.equal(fs.existsSync(safePath(f.root, directory + "/private-preview/result.json")), false)
})
