import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { openArticleTiming, observeArticleStart, observeArticleApproval,
  summarizeArticleTiming, articleTimingStatus } from "../scripts/research/article-timing.mjs"

const helper = fileURLToPath(new URL("../scripts/research/article-timing.mjs", import.meta.url))
const hash = (v) => sha256(JSON.stringify(v))
function fixture(t, { oldRelease = false } = {}) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "article-timing-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, "root"), repo = path.join(dir, "repo")
  fs.mkdirSync(root); fs.mkdirSync(repo)
  const manifest = { files: oldRelease ? [] : [{
    path: "scripts/research/article-timing.mjs", sha256: sha256(fs.readFileSync(helper)),
  }] }
  const release = atomicWrite(repo, "release.json", manifest)
  const round = "round-1"
  const pin = { run_id: round, repository: repo, manifest: release }
  atomicWrite(root, `operations/rounds/${round}/input.json`, pin)
  const roundContext = { round_id: round, round_input_sha256: hash(pin) }
  const plan = { path: "event-plans/plan.json", sha256: "a".repeat(64) }
  const group = "group-1"
  const candidate = { candidate_id: hash([plan, group]), origin_plan: plan, group_id: group,
    execution: { plan, group_id: group } }
  const selection = { run_id: "selection-1", selected: [candidate] }
  const selectionRef = atomicWrite(root, "curation/selection.json", selection)
  const inputPath = "curation/runs/selection-1/workflows/workflow-1/input.json"
  atomicWrite(root, inputPath, { run_id: "workflow-1", selection: selectionRef })
  const commands = []
  function owner(n) {
    const job_id = "module-job-" + n
    const parameters = { run_id: round, round: true }
    const input = { job_id, module: "edition", operation: "advance", parameters,
      context: { operationalRound: roundContext } }
    atomicWrite(root, `module-jobs/${job_id}/input.json`, input)
    const own = { job_id, input_sha256: hash(input), ...roundContext }
    atomicWrite(root, `module-jobs/${job_id}/state.json`, { input_sha256: own.input_sha256 })
    commands.push({ job_id, stage: "processing", module: "edition", operation: "advance", parameters })
    return own
  }
  const a = owner(1)
  const ctx = { root, operationalRound: roundContext }
  function open(own = a, created = true) {
    return openArticleTiming(ctx, { owner: own, inputPath, selectionRef, selection, created, execute: true })
  }
  return { root, repo, round, ctx, selection, selectionRef, inputPath, candidate, plan, group, commands, owner, a, open }
}
function checkpoint(f, status = "approved") {
  const run = "writer-1", child = "cur-events-" + hash([readJSON(f.root, f.inputPath), f.plan]).slice(0, 40)
  const row = status === "reused"
    ? { group_id: f.group, status, approved_run: run }
    : { group_id: f.group, status, writer_run: run }
  atomicWrite(f.root, `runs/${run}/approved-article.json`, { title: "Native approved article" })
  const value = { run_id: child, curation: f.selectionRef, plan: f.plan,
    rows: [row], approved_runs: [run] }
  const bytes = JSON.stringify(value, null, 2) + "\n"
  const digest = sha256(bytes)
  const ref = atomicWrite(f.root, `event-workflows/${child}/checkpoint-outcomes/${digest}.json`, bytes)
  return { run, child, ref }
}

test("only new release and new workflow get timing records; old rounds stay untouched", (t) => {
  const old = fixture(t, { oldRelease: true })
  assert.equal(old.open(), null)
  assert.equal(summarizeArticleTiming(old.root, old.round, old.commands), null)
  const existing = fixture(t)
  assert.equal(existing.open(existing.a, false), null)
  assert.equal(summarizeArticleTiming(existing.root, existing.round, existing.commands), null)
})

test("interrupted and resumed article keeps its first start and bound native approval", (t) => {
  const f = fixture(t), first = f.open(), id = f.candidate.candidate_id
  observeArticleStart(first, id, "2026-11-04T00:00:00.000Z")
  let summary = summarizeArticleTiming(f.root, f.round, f.commands)
  assert.deepEqual(summary.articles.map((r) => [r.started_at, r.approval_observed_at, r.observed_elapsed_ms]),
    [["2026-11-04T00:00:00.000Z", null, null]])
  const own2 = f.owner(2), resumed = f.open(own2, false)
  observeArticleStart(resumed, id, "2026-11-04T00:05:00.000Z")
  const native = checkpoint(f)
  observeArticleApproval(resumed, id, native.child, native.ref, "2026-11-04T00:06:00.000Z")
  observeArticleApproval(resumed, id, native.child, native.ref, "2026-11-04T00:07:00.000Z")
  summary = summarizeArticleTiming(f.root, f.round, f.commands)
  assert.equal(summary.articles[0].started_at, "2026-11-04T00:00:00.000Z")
  assert.equal(summary.articles[0].approval_observed_at, "2026-11-04T00:06:00.000Z")
  assert.equal(summary.articles[0].observed_elapsed_ms, 360000)
  assert.equal(summary.articles[0].approval_status, "approved")
})

test("reuse is distinct and no start is invented when native outcome was observed indirectly", (t) => {
  const f = fixture(t), session = f.open(), native = checkpoint(f, "reused")
  observeArticleApproval(session, f.candidate.candidate_id, native.child, native.ref, "2026-11-04T00:06:00.000Z")
  const row = summarizeArticleTiming(f.root, f.round, f.commands).articles[0]
  assert.equal(row.started_at, null)
  assert.equal(row.observed_elapsed_ms, null)
  assert.equal(row.approval_status, "reused")
})

test("selection, observation, approval, and round job bindings reject changed evidence", (t) => {
  const f = fixture(t), session = f.open(), id = f.candidate.candidate_id, native = checkpoint(f)
  observeArticleStart(session, id, "2026-11-04T00:00:00.000Z")
  observeArticleApproval(session, id, native.child, native.ref, "2026-11-04T00:06:00.000Z")
  assert.throws(() => summarizeArticleTiming(f.root, f.round, []), /not owned/)
  const start = session.directory + id + "/start.json"
  const event = readJSON(f.root, start)
  atomicWrite(f.root, start, { ...event, observed_at: "2026-11-04T00:01:00.000Z" })
  assert.throws(() => summarizeArticleTiming(f.root, f.round, f.commands), /record changed/)
  atomicWrite(f.root, start, event)
  atomicWrite(f.root, `runs/${native.run}/approved-article.json`, { title: "changed" })
  assert.throws(() => summarizeArticleTiming(f.root, f.round, f.commands), /reference changed/)
  atomicWrite(f.root, `runs/${native.run}/approved-article.json`, { title: "Native approved article" })
  atomicWrite(f.root, f.selectionRef.path, { ...f.selection, selected: [] })
  assert.throws(() => summarizeArticleTiming(f.root, f.round, f.commands), /reference changed/)
})

test("missing native approval never becomes an approval time and foreign candidates are rejected", (t) => {
  const f = fixture(t), session = f.open(), id = f.candidate.candidate_id, native = checkpoint(f)
  fs.unlinkSync(safePath(f.root, `runs/${native.run}/approved-article.json`))
  assert.throws(() => observeArticleApproval(session, id, native.child, native.ref, "2026-11-04T00:06:00.000Z"), /input missing/)
  assert.equal(summarizeArticleTiming(f.root, f.round, f.commands).articles[0].approval_observed_at, null)
  assert.throws(() => observeArticleStart(session, "b".repeat(64), "2026-11-04T00:00:00.000Z"), /not selected/)
})

test("real native curation records a reused approval without changing it", async (t) => {
  const { deliveryFixture } = await import("./fixtures/publication-delivery.mjs")
  const { prepareCuration, evaluateCuration, selectCuration, loadCurationPool,
    curationCandidatePacket, CURATION_METRICS } = await import("../scripts/research/curation.mjs")
  const { advanceCuration } = await import("../scripts/research/curation-workflow.mjs")
  const { withRequestOwner } = await import("../scripts/research/request-ownership.mjs")
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", { schema: "research-candidates/v1", candidates: [] })
  const plan = { path: f.plan.path, sha256: f.plan.sha256 }
  const prepared = await prepareCuration(f.ctx, {
    run_id: "timed-curation", briefing_date: "2026-10-12", plans: [plan], max_articles: 1,
  })
  const poolRef = { path: prepared.path, sha256: prepared.sha256 }
  const pool = loadCurationPool(f.ctx, poolRef)
  const candidate = pool.candidates.find((value) => value.group_id === "order")
  const packet = curationCandidatePacket(f.ctx, candidate), source = packet.sources[0]
  const evaluation = {
    candidate_id: candidate.candidate_id, sector: "로봇·제조",
    checks: { source_verified: true, scope_relevant: true, new_information: true,
      current_valid: true, history_compared: true },
    ratings: Object.fromEntries(CURATION_METRICS.map((metric) =>
      [metric, { value: 5, reason: "Compared the original and the supplied history." }])),
    evidence: [{ material_id: source.material_id, block_id: source.blocks[0].block_id, quote: source.blocks[0].text }],
    compared_article_ids: candidate.related_articles.map((article) => article.id), valid_until: null,
  }
  const reviewPath = "timed-review.json"
  atomicWrite(f.root, reviewPath, {
    schema: "research-curation-review/v1", pool_sha256: prepared.sha256,
    reviewer: "fixture-reader", reviewed_at: "2026-11-04T00:00:00.000Z",
    evaluations: [evaluation],
  })
  await evaluateCuration(f.ctx, { pool_path: prepared.path, pool_sha256: prepared.sha256,
    review_file: path.relative(f.ctx.repo, path.join(f.root, reviewPath)) })
  const chosen = await selectCuration(f.ctx, { pool_path: prepared.path, pool_sha256: prepared.sha256 })
  const release = atomicWrite(f.root, "fake-release-manifest.json", { files: [{
    path: "scripts/research/article-timing.mjs", sha256: sha256(fs.readFileSync(helper)),
  }] })
  const round = "native-timing", pin = { run_id: round, repository: f.root, manifest: release }
  atomicWrite(f.root, `operations/rounds/${round}/input.json`, pin)
  const roundContext = { round_id: round, round_input_sha256: hash(pin) }
  f.ctx.operationalRound = roundContext
  const parameters = { run_id: round, round: true }
  const job_id = "module-native-timing"
  const input = { job_id, module: "edition", operation: "advance", parameters,
    context: { operationalRound: roundContext } }
  const owner = { job_id, input_sha256: hash(input), ...roundContext }
  atomicWrite(f.root, `module-jobs/${job_id}/input.json`, input)
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, { input_sha256: owner.input_sha256 })
  const commands = [{ job_id, stage: "processing", module: "edition", operation: "advance", parameters }]
  const before = fs.readFileSync(safePath(f.root, "runs/writer/approved-article.json"))
  const workflow = { run_id: "native-timing-workflow", selection_path: chosen.path,
    selection_sha256: chosen.sha256, execute: true }
  const result = await withRequestOwner(owner, () => advanceCuration(f.ctx, workflow, { baseProvider: f.provider }))
  assert.equal(result.status, "complete")
  assert.deepEqual(fs.readFileSync(safePath(f.root, "runs/writer/approved-article.json")), before)
  const observed = summarizeArticleTiming(f.root, round, commands)
  const item = observed.articles.find((value) => value.candidate_id === candidate.candidate_id)
  assert.ok(item.started_at)
  assert.ok(item.approval_observed_at)
  assert.equal(item.approval_status, "reused")
  assert.ok(item.observed_elapsed_ms >= 0)
  const resumed = await withRequestOwner(owner, () => advanceCuration(f.ctx, workflow, { baseProvider: f.provider }))
  assert.equal(resumed.status, "complete")
  assert.deepEqual(summarizeArticleTiming(f.root, round, commands), observed)
  const timingDir = `operations/rounds/${round}/article-timing/`
  const key = fs.readdirSync(safePath(f.root, timingDir, { materialize: false }))[0]
  const manifestPath = timingDir + key + "/manifest.json"
  atomicWrite(f.root, manifestPath, { ...readJSON(f.root, manifestPath), record_sha256: "0".repeat(64) })
  const continued = await withRequestOwner(owner, () => advanceCuration(f.ctx, workflow, { baseProvider: f.provider }))
  assert.equal(continued.status, "complete", "diagnostic corruption must not block native recovery")
  assert.deepEqual(fs.readFileSync(safePath(f.root, "runs/writer/approved-article.json")), before)
  assert.throws(() => summarizeArticleTiming(f.root, round, commands), /record changed/)
  assert.deepEqual(articleTimingStatus(f.root, round, commands), {
    status: "unavailable", articles: null, reason: "Article timing record changed",
  })
})
