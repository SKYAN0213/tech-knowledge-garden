import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { main } from "../scripts/research.mjs"
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
