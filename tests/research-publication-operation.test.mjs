import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  verifyPublicReadback,
  loadVerifiedPublicReadback,
} from "../scripts/research/public-readback.mjs"
import {
  preparePublicationOperation,
  recordPublicationPush,
  recordPublicationDeployment,
  recordPublicationReadback,
  publicationOperationStatus,
} from "../scripts/research/publication-operation.mjs"

import { fixture } from "./fixtures/publication-operation.mjs"

test("publication operation binds real Git authoring bytes and resumes all completed evidence without HTTP", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({
    ...f.options,
    releasePath: f.releasePath,
    fresh: true,
    now: f.now,
  })
  const push = await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  await recordPublicationDeployment({ ...f.options, deployment: f.deployment })
  await verifyPublicReadback({ ...f.rbOptions, fetchImpl: f.fetchImpl })
  const first = await recordPublicationReadback({ ...f.options, readbackRun: "readback" }),
    calls = f.calls()
  const again = await recordPublicationReadback({ ...f.options, readbackRun: "readback" })
  assert.deepEqual(again, first)
  assert.equal(f.calls(), calls)
  assert.deepEqual(await recordPublicationPush({ ...f.options, pushPath: f.pushPath }), push)
  assert.equal(publicationOperationStatus(f.options).status, "public_bytes_verified")
  assert.equal(first.new_regular_operation_counted, false)
  assert.equal(first.browser_verified, false)
})

test("publication operation rejects stale new writes, changed canonical and changed commit bytes", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    preparePublicationOperation({
      ...f.options,
      releasePath: f.releasePath,
      fresh: true,
      now: f.now + 600001,
    }),
    /Fresh authoring/,
  )
  f.put("vault/" + f.edition, "different")
  await assert.rejects(
    preparePublicationOperation({ ...f.options, releasePath: f.releasePath }),
    /Canonical authoring differs/,
  )
  f.put("vault/" + f.edition, "# Reviewed news\n")
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  f.put("vault/" + f.edition, "wrong committed text")
  f.git("add", "vault")
  f.git("commit", "-qm", "Wrong authoring")
  const bad = f.git("rev-parse", "HEAD")
  f.privatePut(f.pushPath, { ...f.push, local_commit: bad, remote_after_sha: bad })
  await assert.rejects(
    recordPublicationPush({ ...f.options, pushPath: f.pushPath }),
    /Published commit differs/,
  )
})

test("publication operation rechecks authoring raw bytes rather than trusting stored success", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  const raw = path.join(f.root, path.dirname(f.execution.receipt), "raw/0.bin")
  fs.writeFileSync(raw, "tampered")
  assert.throws(() => publicationOperationStatus(f.options), /raw|readback|changed|hash/i)
})

test("stored public proof rejects byte and receipt tampering after a successful deployment", async (t) => {
  const f = await fixture(t)
  await verifyPublicReadback({ ...f.rbOptions, fetchImpl: f.fetchImpl })
  assert.equal(loadVerifiedPublicReadback(f.rbOptions).verified, true)
  fs.writeFileSync(path.join(f.root, "runs/readback/public-readback/files/0.bin"), "tampered")
  assert.throws(() => loadVerifiedPublicReadback(f.rbOptions), /bytes changed/)
})

test("publication operation cannot accept an unrelated CI head or downgrade its owned commit", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await assert.rejects(
    recordPublicationDeployment({ ...f.options, deployment: f.deployment }),
    /Confirmed operation push/,
  )
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  await assert.rejects(
    recordPublicationDeployment({
      ...f.options,
      deployment: { ...f.deployment, headSha: "a".repeat(40) },
    }),
    /exact commit/,
  )
})

test("publication operation rejects a push success flag with contradictory readback failure", async (t) => {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  f.privatePut(f.pushPath, { ...f.push, readback_error: true })
  await assert.rejects(
    recordPublicationPush({ ...f.options, pushPath: f.pushPath }),
    /Confirmed push/,
  )
})
