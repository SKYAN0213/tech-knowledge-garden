import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  recordDevelopmentDefect,
  developmentPendingStatus,
  recordJobDevelopmentFailure,
  recordCollectionDefect,
} from "../scripts/research/development-pending.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import { submitModuleJob } from "../scripts/research/module-runtime.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
function setup(t) {
  const f = fixture(t),
    job_id = "module-defect-fixture"
  const input = {
    job_id,
    module: "parsing",
    operation: "inspect",
    parameters: { run_id: "source-fixture" },
    implementation: { worker: sha256("unit-only") },
    files: [],
  }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(input)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, input)
  const state = {
    input_sha256: owner.input_sha256,
    state: "failed",
    attempt: 1,
    error: "parse failure",
  }
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, state)
  atomicCreate(f.root, "documents/source/body.bin", "Exact original bytes")
  return { ...f, input, owner, state }
}
test("immutable development pending captures source and reproduction without edits, retry or release promotion", (t) => {
  const f = setup(t),
    body = safePath(f.root, "documents/source/body.bin"),
    before = fs.readFileSync(body)
  const request = {
    owner: f.owner,
    stage: "collection",
    error: { message: "parse schema mismatch", code: "PARSE_FAILURE" },
    reproduction: { window: { since: "2026-10-01", until_exclusive: "2026-10-02" } },
    evidence_paths: ["documents/source/body.bin", "documents/unavailable/body.bin"],
  }
  const one = recordDevelopmentDefect(f.ctx, request),
    two = recordDevelopmentDefect(f.ctx, request)
  assert.equal(one.issue_id, two.issue_id)
  assert.equal(two.reused, true)
  assert.equal(one.status, "development_pending")
  assert.equal(one.automatic_retry, false)
  assert.deepEqual(fs.readFileSync(body), before)
  fs.writeFileSync(body, "later source edition")
  const status = developmentPendingStatus(f.root)
  assert.equal(status.total, 1)
  assert.equal(status.issues[0].code_modified, false)
  const raw = status.issues[0].evidence.find((e) => e.path === "documents/source/body.bin")
  assert.deepEqual(fs.readFileSync(safePath(f.root, raw.snapshot.path)), before)
  assert.equal(status.issues[0].evidence.at(-1).availability, "unavailable")
  assert.deepEqual(readJSON(f.root, `module-jobs/${f.owner.job_id}/state.json`), f.state)
})
test("owner drift, path escape, corrupted snapshot and secret error strings fail safely", (t) => {
  const f = setup(t)
  assert.throws(
    () =>
      recordDevelopmentDefect(f.ctx, {
        owner: f.owner,
        stage: "collection",
        error: "bad",
        evidence_paths: ["../foreign"],
      }),
    /escapes/,
  )
  const issue = recordJobDevelopmentFailure(
    f.ctx,
    f.input,
    f.state,
    Error("Authorization Bearer TOPSECRET api_key=PRIVATE sk-proj-hidden"),
  )
  const row = developmentPendingStatus(f.root).issues[0]
  assert.equal(/TOPSECRET|PRIVATE|sk-proj-hidden/.test(row.error.message), false)
  assert.match(row.error.message, /redacted/)
  fs.writeFileSync(safePath(f.root, row.evidence[0].snapshot.path), "corrupt")
  assert.throws(() => developmentPendingStatus(f.root), /evidence changed/)
  atomicWrite(f.root, `module-jobs/${f.owner.job_id}/input.json`, {})
  assert.throws(
    () => recordDevelopmentDefect(f.ctx, { owner: f.owner, stage: "collection", error: "changed" }),
    /input changed/,
  )
  assert.ok(issue.reference.sha256)
})
test("worker failure records a pending issue and read-only CLI does not resume the job", async (t) => {
  const f = fixture(t)
  const job = await submitModuleJob(
    f.ctx,
    "parsing",
    "inspect",
    { run_id: "missing-source" },
    { jobId: "module-worker-defect-test", background: false },
  )
  assert.equal(job.state, "failed")
  assert.ok(job.development_pending, JSON.stringify(job))
  assert.equal(job.development_pending.status, "development_pending")
  const before = fs.readFileSync(safePath(f.root, `module-jobs/${job.job_id}/state.json`))
  const status = await moduleCLI(["defects", "--repo", f.ctx.repo, "--root", f.root])
  assert.equal(status.total, 1)
  assert.equal(status.issues[0].owner.job_id, job.job_id)
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, `module-jobs/${job.job_id}/state.json`)),
    before,
  )
})
test("collection capture requires an owned round and retains exact raw, plan and receipt hashes", (t) => {
  const f = setup(t)
  assert.equal(recordCollectionDefect(f.root, {}), null)
  const round = atomicCreate(f.root, "operations/rounds/fixture-round/input.json", {
    run_id: "fixture-round",
  })
  const owner = {
    ...f.owner,
    round_id: "fixture-round",
    round_input_sha256: sha256(JSON.stringify(readJSON(f.root, round.path))),
  }
  atomicCreate(f.root, "daily/runs/daily-fixture/plan.json", { source: "unit only" })
  const receipt = atomicCreate(f.root, "daily/runs/daily-fixture/receipts/attempt.json", {
    status: "failed",
  })
  const request = {
    run_id: "daily-fixture",
    attempt_id: "attempt",
    window: { channel_id: "unit" },
    receipt,
    result: { documents: [{ body_path: "documents/source/body.bin" }] },
    error: Error("Parser failure"),
  }
  const issue = withRequestOwner(owner, () => recordCollectionDefect(f.root, request))
  assert.equal(withRequestOwner(owner, () => recordCollectionDefect(f.root, request)).reused, true)
  const before = fs.readdirSync(f.root, { recursive: true }).sort()
  const status = developmentPendingStatus(f.root, { round_id: "fixture-round" })
  assert.deepEqual(fs.readdirSync(f.root, { recursive: true }).sort(), before)
  assert.equal(status.total, 1)
  const paths = status.issues[0].evidence.map((e) => e.path)
  assert.ok(paths.includes(receipt.path))
  assert.ok(paths.includes("daily/runs/daily-fixture/plan.json"))
  assert.ok(paths.includes("documents/source/body.bin"))
  assert.equal(status.issues[0].reproduction.receipt.sha256, receipt.sha256)
  assert.equal(issue.status, "development_pending")
  assert.throws(
    () =>
      recordDevelopmentDefect(f.ctx, {
        owner,
        stage: "collection",
        error: "x",
        evidence_paths: Array(41).fill("body.bin"),
      }),
    /bounded/,
  )
})
test("429, policy and storage waits stay outside the developer queue while parse repairs enter it", (t) => {
  const f = setup(t),
    round = atomicCreate(f.root, "operations/rounds/classification/input.json", {
      run_id: "classification",
    })
  const owner = {
    ...f.owner,
    round_id: "classification",
    round_input_sha256: sha256(JSON.stringify(readJSON(f.root, round.path))),
  }
  const receipt = atomicCreate(f.root, "receipt.json", { status: "failed" })
  const common = {
    run_id: "daily",
    attempt_id: "failed-source",
    window: { channel_id: "unit" },
    receipt,
    error: Error("source failed"),
  }
  for (const result of [
    { documents: [{ http_status: 429, fetch_status: "rate_limited" }] },
    { documents: [{ http_status: 403, fetch_status: "blocked", policy_status: "denied" }] },
  ]) {
    assert.equal(
      withRequestOwner(owner, () => recordCollectionDefect(f.root, { ...common, result })),
      null,
    )
  }
  assert.equal(
    withRequestOwner(owner, () =>
      recordCollectionDefect(f.root, {
        ...common,
        error: { code: "STORAGE_PENDING", message: "restore exact bytes" },
      }),
    ),
    null,
  )
  assert.equal(developmentPendingStatus(f.root).total, 0)
  const result = {
    documents: [
      {
        source_version_id: "unit",
        fetch_status: "captured",
        body_path: "documents/source/body.bin",
      },
    ],
    parses: [
      { source_version_id: "unit", status: "failed", quality: { required_fields_present: false } },
    ],
  }
  assert.equal(
    withRequestOwner(owner, () => recordCollectionDefect(f.root, { ...common, result })).status,
    "development_pending",
  )
})
test("snapshot total is capped at 64 MiB and large sources keep their exact path and streamed SHA", (t) => {
  const f = setup(t),
    large = safePath(f.root, "large-source.bin")
  const fd = fs.openSync(large, "wx")
  fs.ftruncateSync(fd, 65 * 1024 ** 2)
  fs.closeSync(fd)
  const issue = recordDevelopmentDefect(f.ctx, {
    owner: f.owner,
    stage: "collection",
    error: "bounded",
    reproduction: {
      password: "private",
      nested: { access_token: "hidden", text: "api_key=masked" },
    },
    evidence_paths: ["large-source.bin"],
  })
  const row = developmentPendingStatus(f.root).issues[0]
  assert.equal(row.evidence.at(-1).availability, "reference_only")
  assert.match(row.evidence.at(-1).sha256, /^[a-f0-9]{64}$/)
  assert.equal(row.evidence.at(-1).path, "large-source.bin")
  assert.ok(
    row.evidence.filter((e) => e.snapshot).reduce((n, e) => n + e.bytes, 0) <= 64 * 1024 ** 2,
  )
  assert.equal(JSON.stringify(row.reproduction).includes("private"), false)
  assert.equal(JSON.stringify(row.reproduction).includes("hidden"), false)
  assert.throws(
    () =>
      recordDevelopmentDefect(f.ctx, {
        owner: f.owner,
        stage: "collection",
        error: "x",
        reproduction: { text: "x".repeat(65536) },
      }),
    /payload exceeds/,
  )
  assert.equal(issue.status, "development_pending")
})
