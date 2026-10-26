import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import {
  captureScheduledInvocation,
  checkedScheduledInvocation,
} from "../scripts/research/schedule-contract.mjs"
import { atomicCreate, readJSON } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

function fixture(t, dispatched = true) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-scheduler-unit-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  atomicCreate(repo, "data/research-operation-policy.json", {
    schedule_id: "tech-knowledge-garden-04",
  })
  const database = path.join(repo, "fixture-scheduler.db"),
    stamp = Date.now() - 1000
  execFileSync("python3", [
    "-c",
    [
      "import sqlite3,sys",
      "db=sqlite3.connect(sys.argv[1])",
      "db.execute('CREATE TABLE automations (id TEXT,kind TEXT,status TEXT,target_thread_id TEXT,last_run_at INTEGER)')",
      "db.execute('INSERT INTO automations VALUES (?,?,?,?,?)',('tech-knowledge-garden-04','heartbeat','ACTIVE','unit-thread',int(sys.argv[2]) if sys.argv[2]!='none' else None))",
      "db.commit()",
    ].join("\n"),
    database,
    dispatched ? String(stamp) : "none",
  ])
  return { ctx: { repo, root: path.join(repo, "private") }, database, stamp }
}
test("actual scheduler dispatch is read-only, idempotent and distinct from a nominal schedule", (t) => {
  const f = fixture(t),
    before = sha256(fs.readFileSync(f.database))
  const ref = captureScheduledInvocation(f.ctx, { database: f.database })
  assert.equal(ref.started_at, new Date(f.stamp).toISOString())
  assert.equal(checkedScheduledInvocation(f.ctx, ref).kind, "scheduled")
  assert.deepEqual(captureScheduledInvocation(f.ctx, { database: f.database }), ref)
  assert.equal(sha256(fs.readFileSync(f.database)), before)
  assert.equal(ref.scheduled_runs_counted, 0)
  assert.ok(ref.next_command.includes(ref.round_id))
})
test("configuration without an actual dispatch cannot manufacture an invocation", (t) => {
  const f = fixture(t, false)
  assert.throws(
    () => captureScheduledInvocation(f.ctx, { database: f.database }),
    /actual active heartbeat/i,
  )
  assert.equal(fs.existsSync(f.ctx.root), false)
})
test("an invocation cannot change normalized time while retaining another actual scheduler row", (t) => {
  const f = fixture(t),
    ref = captureScheduledInvocation(f.ctx, { database: f.database })
  const invocation = readJSON(f.ctx.root, ref.path),
    event = readJSON(f.ctx.root, invocation.evidence.path)
  const changed = new Date(f.stamp - 10000).toISOString()
  const evidence = atomicCreate(f.ctx.root, "tampered-event.json", {
    ...event,
    started_at: changed,
  })
  const invalid = atomicCreate(f.ctx.root, "tampered-invocation.json", {
    ...invocation,
    started_at: changed,
    evidence,
  })
  assert.throws(() => checkedScheduledInvocation(f.ctx, invalid), /actual persisted heartbeat/)
})
