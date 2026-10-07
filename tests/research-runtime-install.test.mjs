import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runtimeCommand, runtimeInstallPlan } from "../scripts/research/runtime-install.mjs"

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-runtime-install-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test("runtime subprocess arguments remain literal and failure output stays in the private log", async (t) => {
  const root = temporary(t),
    log = path.join(root, "failed.log"),
    sentinel = path.join(root, "should-not-exist")
  const literal = `$(touch '${sentinel}'); secret-marker`
  const output = await runtimeCommand(process.execPath, [
    "-e",
    "process.stdout.write(process.argv[1])",
    literal,
  ])
  assert.equal(output, literal)
  assert.equal(fs.existsSync(sentinel), false)
  await assert.rejects(
    runtimeCommand(
      process.execPath,
      ["-e", "process.stderr.write('private-detail');process.exit(4)"],
      { log },
    ),
    /failed \(4\); inspect private log/,
  )
  assert.equal(fs.readFileSync(log, "utf8"), "private-detail")
  assert.equal(fs.statSync(log).mode & 0o077, 0)
})

test("runtime timeout terminates the owned command rather than retrying it", async (t) => {
  const root = temporary(t),
    sentinel = path.join(root, "finished")
  await assert.rejects(
    runtimeCommand(
      process.execPath,
      [
        "-e",
        `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'done'),5000)`,
      ],
      { timeoutMs: 50 },
    ),
    /timed out/,
  )
  assert.equal(fs.existsSync(sentinel), false)
})

test("unverified OCR assets cannot start an installation or alter an existing runtime", (t) => {
  const root = temporary(t),
    ocr = path.join(root, "wrong.onnx"),
    unchanged = path.join(root, "runtime/venv/marker")
  fs.mkdirSync(path.dirname(unchanged), { recursive: true })
  fs.writeFileSync(unchanged, "original runtime")
  fs.writeFileSync(ocr, "unverified model")
  assert.throws(
    () => runtimeInstallPlan({ root, python: process.execPath, ocrModel: ocr }),
    /model hash mismatch/,
  )
  assert.equal(fs.readFileSync(unchanged, "utf8"), "original runtime")
  assert.equal(fs.existsSync(path.join(root, "runtime/installation.json")), false)
})

test("runtime destinations and OCR sources reject symlink escapes before installation", (t) => {
  const root = temporary(t),
    actual = path.join(root, "actual"),
    linked = path.join(root, "linked")
  fs.mkdirSync(actual)
  fs.symlinkSync(actual, linked)
  assert.throws(
    () =>
      runtimeInstallPlan({
        root: linked,
        python: process.execPath,
        ocrModel: path.join(root, "missing"),
      }),
    /Symlink/,
  )
  fs.writeFileSync(path.join(actual, "model"), "unverified")
  fs.symlinkSync(path.join(actual, "model"), path.join(root, "model-link"))
  assert.throws(
    () =>
      runtimeInstallPlan({
        root,
        python: process.execPath,
        ocrModel: path.join(root, "model-link"),
      }),
    /Symlink/,
  )
})
