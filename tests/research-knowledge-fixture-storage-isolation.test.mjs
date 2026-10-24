import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

// Every catalog, policy and payload below belongs to this synthetic sandbox.
const fixtureURL = new URL("./fixtures/research-knowledge-fixtures.mjs", import.meta.url).href
const storageURL = new URL("../scripts/research/cold-storage.mjs", import.meta.url).href
const stateURL = new URL("../scripts/research/run-state.mjs", import.meta.url).href
const lateWriter = [
  "import { atomicWrite } from " + JSON.stringify(stateURL),
  "import { trimColdStorage } from " + JSON.stringify(storageURL),
  "const [root, repo] = process.argv.slice(1)",
  'atomicWrite(root, "documents/late.bin", Buffer.alloc(65536, 65))',
  'atomicWrite(repo, "inputs/late.json", Buffer.alloc(65536, 66))',
  "console.log(JSON.stringify([trimColdStorage(root), trimColdStorage(repo)]))",
].join("\n")
const child = [
  'import fs from "node:fs"',
  'import path from "node:path"',
  'import crypto from "node:crypto"',
  'import { execFileSync } from "node:child_process"',
  'import { DatabaseSync } from "node:sqlite"',
  "import { knowledgeFixture } from " + JSON.stringify(fixtureURL),
  "import { storageAction } from " + JSON.stringify(storageURL),
  "import { atomicWrite } from " + JSON.stringify(stateURL),
  "const [fixtureRepo, nativeText] = process.argv.slice(1)",
  'const ancestor = path.join(fixtureRepo, ".local")',
  'const catalog = path.join(ancestor, ".storage/catalog.sqlite")',
  'const digest = (b) => crypto.createHash("sha256").update(b).digest("hex")',
  "function snapshot() {",
  "  const db = new DatabaseSync(catalog, { readOnly: true })",
  '  const rows = db.prepare("SELECT * FROM files ORDER BY path").all()',
  "  db.close()",
  '  const bytes = Object.fromEntries(["", "-wal"].map((suffix) => [suffix || "main", fs.existsSync(catalog + suffix) ? digest(fs.readFileSync(catalog + suffix)) : null]))',
  "  return { rows, bytes }",
  "}",
  'const policyAt = (root) => { const file = path.join(root, ".storage/policy.json"); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null }',
  'const prepare = () => storageAction(ancestor, "prepare")',
  // Use the real producer and inventory; only the fake ancestor is enabled.
  'storageAction(ancestor, "status")',
  'fs.writeFileSync(path.join(ancestor, ".storage/policy.json"), JSON.stringify({ schema: "research-cold-storage/v1", root: ancestor, enabled: true, cache_bytes: 2147483648, minimum_payload_bytes: 32768 }))',
  "const empty = snapshot()",
  'const controlRoot = path.join(process.env.TMPDIR, "unmarked-control")',
  'atomicWrite(controlRoot, "documents/body.bin", "positive catalog registration control")',
  "const registered = snapshot()",
  "const controlPrepare = prepare()",
  "const before = snapshot()",
  "const cleanups = []",
  "let f, created, prepared, cleaned, creationPrepare, cleanupPrepare, repo, guard, marker, guardBefore, bodyWritten, repoInputsWritten",
  "try {",
  '  f = await knowledgeFixture({ after: (fn) => cleanups.push(fn) }, { nativeJob: nativeText === "true", fixtureRepo })',
  "  repo = f.ctx.repo",
  "  guard = path.dirname(repo)",
  "  marker = policyAt(repo)",
  "  guardBefore = policyAt(guard)",
  '  bodyWritten = fs.existsSync(path.join(f.root, "documents/body.bin"))',
  '  repoInputsWritten = ["notes", "selections", "connections"].every((name) => fs.existsSync(path.join(repo, "inputs", name + ".json")))',
  "  created = snapshot()",
  "  creationPrepare = prepare()",
  "  prepared = snapshot()",
  "} finally {",
  "  for (const cleanup of cleanups.reverse()) await cleanup()",
  "  cleaned = snapshot()",
  "}",
  "const removed = !fs.existsSync(repo)",
  "const guardAfterCleanup = policyAt(guard)",
  "cleanupPrepare = prepare()",
  "const cleanedPrepared = snapshot()",
  // A fresh process rules out the configuredRoot cache hiding late inheritance.
  "let lateTrim, lateWritten, latePrepared, latePrepare, lateSizes, guardAfterLate",
  "try {",
  "  lateTrim = JSON.parse(execFileSync(process.execPath, " +
    JSON.stringify(["--input-type=module", "-e", lateWriter]) +
    '.concat([f.root, repo]), { encoding: "utf8" }))',
  '  lateSizes = [path.join(f.root, "documents/late.bin"), path.join(repo, "inputs/late.json")].map((file) => fs.statSync(file).size)',
  "  lateWritten = snapshot()",
  "  latePrepare = prepare()",
  "  latePrepared = snapshot()",
  "  guardAfterLate = policyAt(guard)",
  "} finally {",
  "  fs.rmSync(repo, { recursive: true, force: true })",
  "}",
  'console.log(JSON.stringify({ empty, registered, before, created, prepared, cleaned, cleanedPrepared, lateWritten, latePrepared, controlPrepare, creationPrepare, cleanupPrepare, latePrepare, repo, guard, marker, guardBefore, guardAfterCleanup, guardAfterLate, bodyWritten, repoInputsWritten, removed, lateTrim, lateSizes, parentPolicy: policyAt(ancestor), relativeRepo: path.relative(ancestor, repo).split(path.sep), controlPath: path.relative(ancestor, path.join(controlRoot, "documents/body.bin")).split(path.sep).join("/") }))',
].join("\n")

for (const nativeJob of [false, true]) {
  test(
    "knowledge fixture isolates parent prepare, cleanup and late writes (nativeJob=" +
      nativeJob +
      ")",
    (t) => {
      const temp = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-storage-isolation-")),
      )
      t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
      const tmp = path.join(temp, ".local", "research", "local-ai", "tmp")
      fs.mkdirSync(tmp, { recursive: true })
      const result = JSON.parse(
        execFileSync(
          process.execPath,
          ["--input-type=module", "-e", child, temp, String(nativeJob)],
          {
            cwd: temp,
            env: { ...process.env, TMPDIR: tmp, PYTHONDONTWRITEBYTECODE: "1" },
            encoding: "utf8",
            timeout: 30000,
          },
        ),
      )
      t.diagnostic(
        JSON.stringify({
          nativeJob,
          rows: Object.fromEntries(
            [
              "registered",
              "before",
              "created",
              "prepared",
              "cleaned",
              "cleanedPrepared",
              "lateWritten",
              "latePrepared",
            ].map((stage) => [stage, result[stage].rows.length]),
          ),
          controlPackages: result.controlPrepare.new_packages,
          laterPackages: [result.creationPrepare, result.cleanupPrepare, result.latePrepare].map(
            (prepared) => prepared.new_packages,
          ),
          guardSurvivedCleanup: result.guardAfterCleanup !== null,
          lateTrim: result.lateTrim,
        }),
      )
      assert.deepEqual(result.empty.rows, [])
      assert.equal(result.registered.rows.length, 1)
      assert.equal(result.registered.rows[0].path, result.controlPath)
      assert.notDeepEqual(result.registered, result.empty)
      assert.equal(result.controlPrepare.inventoried_files, 1)
      assert.equal(result.controlPrepare.new_packages, 1)
      assert.equal(result.controlPrepare.new_unique_objects, 1)
      assert.deepEqual(result.before.rows, result.registered.rows)
      assert.equal(result.bodyWritten, true)
      assert.equal(result.repoInputsWritten, true)
      for (const stage of [
        "created",
        "prepared",
        "cleaned",
        "cleanedPrepared",
        "lateWritten",
        "latePrepared",
      ]) {
        assert.deepEqual(
          result[stage],
          result.before,
          stage + " must preserve catalog bytes and every files row",
        )
      }
      for (const prepared of [result.creationPrepare, result.cleanupPrepare, result.latePrepare]) {
        assert.equal(prepared.inventoried_files, 1)
        assert.equal(prepared.updated, 0)
        assert.equal(prepared.new_packages, 0)
        assert.equal(prepared.new_unique_objects, 0)
      }
      assert.equal(result.relativeRepo.length, 3)
      assert.equal(result.relativeRepo[0], "research-test-fixtures")
      assert.match(result.relativeRepo[1], /^guard-/)
      assert.match(result.relativeRepo[2], /^knowledge-integration-/)
      assert.deepEqual(result.marker, {
        schema: "research-cold-storage/v1",
        root: result.repo,
        enabled: false,
      })
      assert.deepEqual(result.guardBefore, {
        schema: "research-cold-storage/v1",
        root: result.guard,
        enabled: false,
      })
      assert.deepEqual(result.guardAfterCleanup, result.guardBefore)
      assert.deepEqual(result.guardAfterLate, result.guardBefore)
      assert.equal(result.removed, true)
      assert.deepEqual(result.lateTrim, [null, null])
      assert.deepEqual(result.lateSizes, [65536, 65536])
      assert.equal(result.parentPolicy.enabled, true)
    },
  )
}
