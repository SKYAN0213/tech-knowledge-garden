import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { sha256 } from "./contracts.mjs"
import { safePath, atomicCreate, readJSON } from "./run-state.mjs"

// The app has no execution-history tool for thread heartbeats. Read only the
// existing scheduler's last dispatch row; never infer a dispatch from RRULE.
export function captureScheduledInvocation(ctx, { database } = {}) {
  const contract = scheduleContract(ctx.executionRepo || ctx.repo)
  database ||= path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    "sqlite/codex-dev.db",
  )
  const source = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        [
          "import sqlite3,json,pathlib,sys",
          "p=pathlib.Path(sys.argv[1]).resolve()",
          "db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True)",
          "db.row_factory=sqlite3.Row",
          "r=db.execute('SELECT id,kind,status,target_thread_id,last_run_at FROM automations WHERE id=?',(sys.argv[2],)).fetchone()",
          "print(json.dumps(dict(r) if r else None))",
        ].join("\n"),
        database,
        contract.schedule_id,
      ],
      { encoding: "utf8", timeout: 10000 },
    ),
  )
  if (
    !source ||
    source.kind !== "heartbeat" ||
    source.status !== "ACTIVE" ||
    source.id !== contract.schedule_id ||
    !source.target_thread_id ||
    !Number.isSafeInteger(source.last_run_at) ||
    source.last_run_at <= 0 ||
    source.last_run_at > Date.now()
  )
    throw Error(
      "Actual active heartbeat dispatch evidence required; configuration alone is insufficient",
    )
  const execution_id = `${source.id}-${source.last_run_at}`
  const started_at = new Date(source.last_run_at).toISOString()
  const event = {
    schema: "research-codex-heartbeat-dispatch/v1",
    kind: "scheduled",
    schedule_id: source.id,
    execution_id,
    started_at,
    scheduler_record: source,
    origin: "codex_desktop_sqlite_readonly",
  }
  const install = (relative, value) => {
    const old = readJSON(ctx.root, relative)
    if (old && JSON.stringify(old) !== JSON.stringify(value))
      throw Error("Scheduler dispatch capture changed")
    if (!old) atomicCreate(ctx.root, relative, value)
    return { path: relative, sha256: sha256(fs.readFileSync(safePath(ctx.root, relative))) }
  }
  const evidence = install(`operations/scheduler-events/${execution_id}.json`, event)
  const ref = install(`operations/scheduled-invocations/${execution_id}.json`, {
    schema: "research-scheduled-invocation/v2",
    kind: "scheduled",
    schedule_id: source.id,
    execution_id,
    started_at,
    reason: "Existing heartbeat's actual persisted dispatch; completion is not inferred",
    evidence,
  })
  checkedScheduledInvocation(ctx, ref)
  const day = new Date(source.last_run_at + 9 * 3600000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "")
  const round_id = `daily-${day}-${sha256(execution_id).slice(0, 12)}`
  return {
    ...ref,
    round_id,
    execution_id,
    started_at,
    scheduled_runs_counted: 0,
    next_command: [
      "node",
      "scripts/research-operations.mjs",
      "run",
      "--round",
      round_id,
      "--invocation",
      ref.path,
      "--invocation-sha256",
      ref.sha256,
      "--background",
    ],
  }
}

export function captureManualInvocation(ctx, { execution_id, reason }) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(execution_id || "") ||
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.length > 1000
  )
    throw Error("Exact manual execution ID and reason required")
  const relative = `operations/manual-invocations/${execution_id}.json`
  const old = readJSON(ctx.root, relative)
  if (old && old.reason !== reason) throw Error("Manual invocation reason changed")
  if (!old)
    atomicCreate(ctx.root, relative, {
      schema: "research-manual-invocation/v1",
      kind: "manual",
      execution_id,
      reason,
      started_at: new Date().toISOString(),
      origin: "operator_cli",
    })
  return { path: relative, sha256: sha256(fs.readFileSync(safePath(ctx.root, relative))) }
}

export function checkedOperationalInvocation(ctx, ref) {
  const bytes = fs.readFileSync(safePath(ctx.root, ref?.path || "invalid-invocation"))
  if (sha256(bytes) !== ref?.sha256) throw Error("Operational invocation SHA changed")
  const value = JSON.parse(bytes)
  if (value.kind === "scheduled") return checkedScheduledInvocation(ctx, ref)
  if (
    value.schema !== "research-manual-invocation/v1" ||
    value.kind !== "manual" ||
    value.origin !== "operator_cli" ||
    value.schedule_id !== undefined ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(value.execution_id || "") ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.length > 1000 ||
    !Number.isFinite(Date.parse(value.started_at)) ||
    Date.parse(value.started_at) > Date.now()
  )
    throw Error("Exact manual or actual scheduled invocation required")
  return value
}

export function scheduleContract(repo) {
  const policy = JSON.parse(fs.readFileSync(safePath(repo, "data/research-operation-policy.json")))
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(policy.schedule_id || ""))
    throw Error("Configured schedule identity required")
  return { schedule_id: policy.schedule_id, timezone: "Asia/Seoul", start_time: "04:00" }
}

// A configuration readback alone never supplies an execution ID or a run.
export function checkedScheduledInvocation(
  ctx,
  ref,
  { notAfter = Date.now(), allowLegacy = false } = {},
) {
  const bytes = fs.readFileSync(safePath(ctx.root, ref?.path || "invalid-invocation"))
  if (sha256(bytes) !== ref?.sha256) throw Error("Scheduled invocation SHA changed")
  const invocation = JSON.parse(bytes)
  if (invocation.schema !== "research-scheduled-invocation/v2" && !allowLegacy)
    throw Error("New scheduled invocation capture requires v2 execution evidence")
  const contract = scheduleContract(ctx.repo)
  const scheduleMatches =
    invocation.schedule_id === contract.schedule_id ||
    (allowLegacy &&
      invocation.schema === "research-scheduled-invocation/v1" &&
      invocation.schedule_id === "tech-ai-briefing-08")
  const started = Date.parse(invocation.started_at)
  const end = typeof notAfter === "number" ? notAfter : Date.parse(notAfter)
  if (
    !["research-scheduled-invocation/v1", "research-scheduled-invocation/v2"].includes(
      invocation.schema,
    ) ||
    invocation.kind !== "scheduled" ||
    !scheduleMatches ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(invocation.execution_id || "") ||
    !invocation.reason?.trim() ||
    !Number.isFinite(started) ||
    !(end >= started) ||
    !/^[a-f0-9]{64}$/.test(invocation.evidence?.sha256 || "")
  )
    throw Error("Exact attributed scheduled invocation capture required")
  const evidence = fs.readFileSync(safePath(ctx.root, invocation.evidence.path))
  if (!evidence.length || sha256(evidence) !== invocation.evidence.sha256)
    throw Error("Exact attributed scheduled invocation capture required")
  if (invocation.schema === "research-scheduled-invocation/v2") {
    const event = JSON.parse(evidence)
    if (
      event.schema === "research-codex-heartbeat-dispatch/v1" &&
      (event.origin !== "codex_desktop_sqlite_readonly" ||
        event.scheduler_record?.kind !== "heartbeat" ||
        event.scheduler_record?.id !== contract.schedule_id ||
        !Number.isSafeInteger(event.scheduler_record?.last_run_at) ||
        event.execution_id !==
          `${event.scheduler_record.id}-${event.scheduler_record.last_run_at}` ||
        event.started_at !== new Date(event.scheduler_record.last_run_at).toISOString())
    )
      throw Error("Invocation differs from the actual persisted heartbeat dispatch")
    if (
      event.execution_id !== invocation.execution_id ||
      event.schedule_id !== contract.schedule_id ||
      event.started_at !== invocation.started_at ||
      event.kind !== "scheduled"
    )
      throw Error("Invocation must match actual scheduler execution evidence")
  }
  return invocation
}
