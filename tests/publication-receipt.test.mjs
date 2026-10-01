import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pushAndVerify } from "../scripts/publication-receipt.mjs"

const commit = "a".repeat(40)

function gitStub({
  pushApplied = true,
  pushErrors = false,
  readbackFails = false,
  initialRemote = null,
} = {}) {
  let remoteCommit = initialRemote
  let reads = 0
  let pushes = 0
  return (args) => {
    if (args[0] === "rev-parse") return commit
    if (args[0] === "ls-remote") {
      reads++
      if (readbackFails && reads === 2) throw Error("network lost after push")
      return remoteCommit ? `${remoteCommit}\trefs/heads/main` : ""
    }
    if (args[0] === "push") {
      pushes++
      if (pushApplied) remoteCommit = commit
      if (pushErrors) throw Error("push response was lost")
      return ""
    }
    if (args[0] === "push-count") return String(pushes)
    throw Error(`Unexpected git command: ${args[0]}`)
  }
}

test("publication receipt confirms a normal push from remote readback", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publication-receipt-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receipt = pushAndVerify({
    root,
    attemptId: "normal-push",
    runGit: gitStub(),
    now: () => "2026-10-01T08:00:00.000Z",
  })
  assert.equal(receipt.status, "remote_confirmed")
  assert.equal(receipt.remote_before_sha, null)
  assert.equal(receipt.remote_after_sha, commit)
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "publication/push-attempts/normal-push.json")))
      .local_commit,
    commit,
  )
})

test("a rerun skips push when the remote already contains the local commit", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "publication-already-current-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runGit = gitStub({ initialRemote: commit })
  const receipt = pushAndVerify({ root, attemptId: "already-current", runGit })
  assert.equal(receipt.status, "remote_already_current")
  assert.equal(runGit(["push-count"]), "0")
})

test("publication receipt resolves a lost push response only when remote head confirms it", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publication-lost-response-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receipt = pushAndVerify({
    root,
    attemptId: "lost-response",
    runGit: gitStub({ pushErrors: true }),
  })
  assert.equal(receipt.push_command_error, true)
  assert.equal(receipt.status, "remote_confirmed_after_push_error")
})

test("publication receipt preserves ambiguous or failed outcomes for readback recovery", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publication-unconfirmed-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.throws(
    () =>
      pushAndVerify({
        root,
        attemptId: "not-pushed",
        runGit: gitStub({ pushApplied: false, pushErrors: true }),
      }),
    /push_not_confirmed/,
  )
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "publication/push-attempts/not-pushed.json")))
      .status,
    "push_not_confirmed",
  )

  assert.throws(
    () =>
      pushAndVerify({
        root,
        attemptId: "readback-lost",
        runGit: gitStub({ readbackFails: true }),
      }),
    /readback_unavailable/,
  )
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "publication/push-attempts/readback-lost.json")))
      .status,
    "readback_unavailable",
  )
})
