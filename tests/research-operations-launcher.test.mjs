import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"

test("scheduler re-entry follows a continuation with the successor invocation and rejects foreign evidence", (t) => {
  // Launcher-only fixture. Its child prints arguments; it never runs collection,
  // models, native approvals or a publication and is not an operating receipt.
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-launcher-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const runtime = path.join(workspace, "runtime")
  const root = path.join(workspace, ".local/research/local-ai")
  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex")
  const write = (base, relative, data) => {
    const bytes = JSON.stringify(data)
    const file = path.join(base, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
    return { path: relative, sha256: hash(bytes) }
  }
  fs.mkdirSync(path.join(workspace, "scripts"))
  fs.copyFileSync(
    new URL("../scripts/research-operations.mjs", import.meta.url),
    path.join(workspace, "scripts/research-operations.mjs"),
  )
  const installation = write(runtime, ".local/.storage/runtime-release.json", {
    fixture_only: true,
  })
  fs.mkdirSync(path.join(runtime, "scripts"))
  fs.writeFileSync(
    path.join(runtime, "scripts/research-module.mjs"),
    "console.log(JSON.stringify(process.argv.slice(2)))",
  )
  write(workspace, ".local/.storage/active-runtime.json", { workspace, runtime, installation })
  const originalInvocation = { path: "scheduled.json", sha256: "1".repeat(64) }
  const successorInvocation = { path: "manual-recovery.json", sha256: "2".repeat(64) }
  const parent = write(root, "operations/rounds/daily-parent/input.json", {
    invocation: originalInvocation,
  })
  const evidence = write(root, "operations/rounds/daily-parent/continuation-evidence.json", {
    parent,
    successor: "daily-child",
  })
  const successor_pin = write(root, "operations/rounds/daily-child/input.json", {
    run_id: "daily-child",
    execution_repository: runtime,
    invocation: successorInvocation,
    continuation: evidence,
  })
  write(root, "operations/rounds/daily-parent/continuation.json", {
    successor: "daily-child",
    evidence,
    successor_pin,
  })
  const args = [
    path.join(workspace, "scripts/research-operations.mjs"),
    "drive",
    "--round",
    "daily-parent",
    "--invocation",
    originalInvocation.path,
    "--invocation-sha256",
    originalInvocation.sha256,
  ]
  const output = JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8" }))
  assert.equal(output[output.indexOf("--round") + 1], "daily-child")
  assert.equal(output[output.indexOf("--invocation") + 1], successorInvocation.path)
  assert.equal(output[output.indexOf("--invocation-sha256") + 1], successorInvocation.sha256)
  args[args.indexOf("--invocation") + 1] = "foreign.json"
  assert.throws(
    () => execFileSync(process.execPath, args, { encoding: "utf8", stdio: "pipe" }),
    /invocation|Command failed/i,
  )
})
