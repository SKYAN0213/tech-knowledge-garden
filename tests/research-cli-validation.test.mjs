import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { main, scanListImplementationFingerprints } from "../scripts/research.mjs"
import { dailySourcePaths } from "../scripts/research/daily-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { acquireLock, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

test("discover rejects ignored URL overrides before creating a run or fetching sources", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-discover-url-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await assert.rejects(
    main([
      "discover",
      "--root",
      root,
      "--run",
      "invalid-url-scope",
      "--url",
      "https://example.org/news/page/2",
    ]),
    /discover does not accept --url; use --channel/,
  )
  assert.equal(fs.existsSync(path.join(root, "runs", "invalid-url-scope")), false)
})

test("scan-list run fingerprints include every dedicated scanner and shared checkpoint parser", () => {
  const fingerprints = scanListImplementationFingerprints()
  const expected = {
    sec_scan_sha256: "scripts/research/sec-scan.mjs",
    wordpress_scan_sha256: "scripts/research/wordpress-scan.mjs",
    monthly_scan_sha256: "scripts/research/monthly-scan.mjs",
    parser_sha256: "scripts/research/parser.mjs",
    run_state_sha256: "scripts/research/run-state.mjs",
  }
  for (const [key, file] of Object.entries(expected))
    assert.equal(fingerprints[key], sha256(fs.readFileSync(file)))
  const dailyPaths = dailySourcePaths()
  for (const file of [
    "scripts/research/api.mjs",
    "scripts/research/sec-scan.mjs",
    "scripts/research/wordpress-scan.mjs",
    "scripts/research/ur-scan.mjs",
    "scripts/research/form-html-scan.mjs",
    "scripts/research/robots.mjs",
  ])
    assert.ok(dailyPaths.includes(file), `daily fingerprint omits ${file}`)
})

test("collect without a model policy reaches source URL validation", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-collect-no-model-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await assert.rejects(
    main([
      "collect",
      "--root",
      root,
      "--run",
      "collect-without-model-policy",
      "--url",
      "https://127.0.0.1/private",
    ]),
    /non-public/i,
  )
})

test("recover-lock CLI removes only an explicitly identified lock with a dead PID", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-lock-recovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const owner = "4c69cf8f-1185-49af-9fb8-77365cc098fa",
    started_at = new Date().toISOString()
  atomicWrite(root, "locks/stale.json", {
    owner,
    pid: 2147483647,
    started_at,
  })
  assert.deepEqual(
    await main(["recover-lock", "--root", root, "--lock", "stale", "--expected-owner", owner]),
    {
      status: "recovered",
      lock_name: "stale",
      owner,
      pid: 2147483647,
      started_at,
    },
  )
  assert.equal(fs.existsSync(path.join(root, "locks/stale.json")), false)
  await assert.rejects(
    main([
      "recover-lock",
      "--root",
      root,
      "--lock",
      "stale",
      "--expected-owner",
      owner,
      "--run",
      "unexpected-run",
    ]),
    /accepts only/,
  )

  const release = acquireLock(root, "active"),
    liveOwner = readJSON(root, "locks/active.json").owner
  try {
    await assert.rejects(
      main(["recover-lock", "--root", root, "--lock", "active", "--expected-owner", liveOwner]),
      /still running/,
    )
    assert.equal(readJSON(root, "locks/active.json").owner, liveOwner)
  } finally {
    release()
  }
})
