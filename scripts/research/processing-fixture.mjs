import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { sha256 } from "./contracts.mjs"
import { recordFactReview } from "./claims.mjs"
import { eventWorkKey } from "./event-pipeline.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { implementationFiles } from "./development-release.mjs"

const prefixes =
  /^(?:runs|parses|documents|event-plans|event-selections|event-work|editions|daily|curation|context|baselines|candidate-approvals|source-index)\//
const read = (file) => JSON.parse(fs.readFileSync(file))
const hash = (file) => sha256(fs.readFileSync(file))
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function copyFile(source, destination) {
  const stat = fs.lstatSync(source)
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Fixture requires regular source files")
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE)
}
function checkFixtureTree(directory, measureBytes = false) {
  let bytes = 0n
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error("Fixture cannot follow symlinks")
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) bytes += checkFixtureTree(full, measureBytes)
    else if (!entry.isFile()) throw Error("Fixture requires regular source files")
    else if (measureBytes) {
      const stat = fs.lstatSync(full, { bigint: true })
      if (!stat.isFile()) throw Error("Fixture requires regular source files")
      bytes += stat.size
    }
  }
  return bytes
}

function copyFixtureTreePortable(source, destination) {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name),
      to = path.join(destination, entry.name)
    if (entry.isDirectory()) copyFixtureTreePortable(from, to)
    else copyFile(from, to)
  }
}

export function copyFixtureTree(source, destination, { reserveBytes = 0 } = {}) {
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0)
    throw Error("Nonnegative fixture space reserve required")
  let sourceStat
  try {
    sourceStat = fs.lstatSync(source)
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  if (sourceStat.isSymbolicLink()) throw Error("Fixture cannot follow symlinks")
  if (!sourceStat.isDirectory()) throw Error("Fixture source directory required")
  if (fs.lstatSync(destination, { throwIfNoEntry: false }))
    throw Error("Fixture requires a fresh destination")
  const bytes = checkFixtureTree(source, reserveBytes > 0)
  if (reserveBytes > 0) {
    let existing = path.dirname(path.resolve(destination))
    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing)
      if (parent === existing) throw Error("Fixture destination filesystem unavailable")
      existing = parent
    }
    const space = fs.statfsSync(existing, { bigint: true })
    if (space.bavail * space.bsize < bytes + BigInt(reserveBytes))
      throw Error("Insufficient free space for a full fixture copy and reserve")
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  // Claim the destination before copying, so a concurrent creator cannot make
  // the operating-system copy write into an existing directory.
  fs.mkdirSync(destination)
  if (process.platform === "darwin") {
    // Node's COPYFILE_FICLONE silently falls back to full copies on macOS.
    // The system copy supports APFS copy-on-write and also works across volumes.
    execFileSync("/bin/cp", ["-cR", source + "/", destination], { stdio: "pipe" })
  } else copyFixtureTreePortable(source, destination)
  // A source changed during copying must not introduce a symlink or special file.
  checkFixtureTree(destination)
}
function nativeReview(root, run, reviewDirectory) {
  const original = read(safePath(root, `runs/${run}/claims.json`))
  const expected = read(safePath(root, `runs/${run}/reviewed-claims.json`)).claims
  const parses = read(safePath(root, `runs/${run}/parses.json`))
  for (const name of fs
    .readdirSync(reviewDirectory)
    .filter((n) => n.startsWith("fact-review-" + run) && n.endsWith(".json"))
    .sort()) {
    const file = path.join(reviewDirectory, name),
      decision = read(file)
    if (!decision.claims) continue
    try {
      const current = recordFactReview(original.claims, decision.claims, decision, parses)
      if (JSON.stringify(current) === JSON.stringify(expected))
        return { file, sha256: hash(file), value: decision }
    } catch {
      /* Other immutable historical attempts remain separate evidence. */
    }
  }
  throw Error("Exact saved native fact decision not found: " + run)
}

// A fixture is a separate private repository. Only source/selection inputs and
// genuine prior approvals enter its native root. Generated outputs for the 31
// new articles live exclusively in the replay oracle, never in starting state.
export function prepareProcessingFixture({
  sourceRepo,
  sourceRoot,
  authorityVault,
  destination,
  selection,
  articleRuns,
  reviewDirectory,
}) {
  if (fs.existsSync(destination)) throw Error("New processing fixture destination required")
  for (const p of [sourceRepo, sourceRoot, authorityVault])
    if (!path.isAbsolute(p) || fs.realpathSync(p) !== p)
      throw Error("Real absolute fixture roots required")
  const originalSelection = read(safePath(sourceRoot, selection.path))
  if (
    hash(safePath(sourceRoot, selection.path)) !== selection.sha256 ||
    originalSelection.selected.length !== articleRuns.length
  )
    throw Error("Exact frozen processing selection required")
  const pool = read(safePath(sourceRoot, originalSelection.pool.path))
  for (const f of pool.history.files)
    if (hash(safePath(authorityVault, f.path)) !== f.sha256)
      throw Error("Pre-processing article history changed: " + f.path)
  const backlog = pool.context.backlog
  if (hash(backlog) !== pool.history.backlog_sha256)
    throw Error("Pre-processing candidate backlog changed")
  fs.mkdirSync(destination, { recursive: false })
  const seed = path.join(destination, "seed"),
    root = path.join(seed, ".local/research/local-ai")
  fs.mkdirSync(root, { recursive: true })
  copyFixtureTree(path.join(sourceRepo, "data"), path.join(seed, "data"))
  copyFixtureTree(authorityVault, path.join(seed, "vault"))
  copyFile(backlog, path.join(seed, ".local/research/candidate-backlog.json"))
  const fresh = new Set(articleRuns.filter((a) => a.action !== "reuse").map((a) => a.writer_run))
  const files = new Set(),
    queue = [],
    modelRuns = new Set(),
    oracle = []
  const enqueue = (relative) => {
    if (
      typeof relative !== "string" ||
      !prefixes.test(relative) ||
      relative.includes("..") ||
      path.isAbsolute(relative)
    )
      return
    if (files.has(relative)) return
    const writer = relative.match(/^runs\/([^/]+)\/(.+)$/)
    if (writer && fresh.has(writer[1]) && writer[2] !== "event-selection.json") return
    const from = safePath(sourceRoot, relative)
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) return
    files.add(relative)
    queue.push(relative)
  }
  const sourceRun = (id) => {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id || "")) return
    for (const name of [
      "documents.json",
      "parses.json",
      "source-selection.json",
      "source-bundle.json",
      "event-selection.json",
    ])
      enqueue(`runs/${id}/${name}`)
  }
  const priorRun = (id) => {
    if (!id || fresh.has(id)) return
    const base = safePath(sourceRoot, `runs/${id}`)
    if (!fs.existsSync(base)) throw Error("Native prior approval unavailable: " + id)
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) throw Error("Symlink in native prior approval")
        if (entry.isDirectory()) walk(full)
        else enqueue(path.relative(sourceRoot, full))
      }
    }
    walk(base)
  }
  const visit = (value) => {
    if (!value || typeof value !== "object") return
    if (value.path) enqueue(value.path)
    if (value.body_path) enqueue(value.body_path)
    if (value.parse_path) enqueue(value.parse_path)
    if (/^[a-f0-9]{64}$/.test(value.parse_id || "")) enqueue(`parses/${value.parse_id}/parse.json`)
    if (value.source_run) sourceRun(value.source_run)
    if (value.prior_run) priorRun(value.prior_run)
    if (value.prior?.run_id) priorRun(value.prior.run_id)
    if (value.existing_event?.run_id) priorRun(value.existing_event.run_id)
    if (value.approval_run) priorRun(value.approval_run)
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && /(?:path|_file)$/.test(key)) enqueue(child)
      else if (child && typeof child === "object") visit(child)
    }
  }
  enqueue(selection.path)
  for (const item of originalSelection.selected) {
    enqueue(item.execution.plan.path)
    enqueue(item.origin_plan.path)
    enqueue(item.evaluation.path)
    const a = articleRuns.find((a) => a.candidate_id === item.candidate_id)
    if (!a?.writer_run) throw Error("Every fixed article needs its original writer identity")
    if (item.action === "reuse") {
      const planRef = item.execution.plan
      if (!/^[a-f0-9]{64}$/.test(planRef.sha256 || "") || hash(safePath(sourceRoot, planRef.path)) !== planRef.sha256)
        throw Error("Fixture selected reuse plan changed")
      const plan = read(safePath(sourceRoot, planRef.path))
      const events = plan.events?.filter((event) => event.group_id === item.execution.group_id) || []
      if (a.action !== "reuse" || events.length !== 1 || events[0].action !== "reuse" ||
          events[0].prior?.run_id !== a.writer_run)
        throw Error("Fixture selected reuse no longer identifies its prior writer")
      priorRun(a.writer_run)
      continue
    }
    const pointer = read(safePath(sourceRoot, `runs/${a.writer_run}/event-selection.json`))
    enqueue(`runs/${a.writer_run}/event-selection.json`)
    enqueue(pointer.path)
    enqueue(`event-selections/${a.writer_run}/input.json`)
    const selected = read(safePath(sourceRoot, pointer.path))
    sourceRun(selected.source_run)
    enqueue(`event-plans/${selected.plan.path.split("/")[1]}/selections/${selected.group_id}.json`)
    const originalClaims = read(safePath(sourceRoot, `runs/${a.writer_run}/claims.json`))
    const reviewed = read(safePath(sourceRoot, `runs/${a.writer_run}/reviewed-claims.json`))
    const draft = read(safePath(sourceRoot, `runs/${a.writer_run}/draft.json`))
    const fact = nativeReview(sourceRoot, a.writer_run, reviewDirectory)
    const editorial = read(safePath(sourceRoot, `runs/${a.writer_run}/editorial-review.json`))
    const corrections = fs.existsSync(safePath(sourceRoot, `runs/${a.writer_run}/corrections`))
      ? fs
          .readdirSync(safePath(sourceRoot, `runs/${a.writer_run}/corrections`))
          .filter((n) => n.endsWith(".json"))
          .map((n) => read(safePath(sourceRoot, `runs/${a.writer_run}/corrections/${n}`)))
      : []
    oracle.push({
      candidate_id: a.candidate_id,
      writer_run: a.writer_run,
      action: item.action,
      original_claims: originalClaims.claims,
      reviewed_claims: reviewed.claims,
      fact_review: fact.value,
      fact_review_source: { path: fact.file, sha256: fact.sha256 },
      completeness_review: draft.completeness_context?.review,
      editorial_review: editorial,
      coverage_review: editorial.completeness_review,
      editorial_attempts: fs
        .readdirSync(reviewDirectory)
        .filter((n) => n.startsWith("editorial-review-" + a.writer_run) && n.endsWith(".json"))
        .map((n) => ({
          source_file: path.join(reviewDirectory, n),
          value: read(path.join(reviewDirectory, n)),
        }))
        .filter((r) => r.value.draft_id && r.value.status),
      coverage_attempts: fs
        .readdirSync(reviewDirectory)
        .filter((n) => n.startsWith("coverage-review-" + a.writer_run) && n.endsWith(".json"))
        .map((n) => ({
          source_file: path.join(reviewDirectory, n),
          value: read(path.join(reviewDirectory, n)),
        }))
        .filter((r) => r.value.draft_id),
      final_draft: draft,
      corrections,
      expected_approved: read(safePath(sourceRoot, `runs/${a.writer_run}/approved-article.json`)),
    })
    modelRuns.add(a.writer_run)
    for (const s of originalClaims.provenance?.sources || []) modelRuns.add(s.run)
  }
  // Preserve source-to-writer bindings, not their generated article artifacts.
  for (const dir of ["event-work"])
    if (fs.existsSync(safePath(sourceRoot, dir))) {
      for (const name of fs.readdirSync(safePath(sourceRoot, dir))) {
        const relative = `${dir}/${name}/selection.json`,
          full = safePath(sourceRoot, relative)
        if (fs.existsSync(full) && articleRuns.some((a) => a.writer_run === read(full).writer_run))
          enqueue(relative)
      }
    }
  for (let i = 0; i < queue.length; i++) {
    const relative = queue[i],
      from = safePath(sourceRoot, relative)
    copyFile(from, path.join(root, relative))
    if (relative.endsWith(".json")) visit(read(from))
  }
  const exchanges = [],
    seenModels = new Set()
  const modelQueue = [...modelRuns]
  for (let i = 0; i < modelQueue.length; i++) {
    const run = modelQueue[i]
    if (!run || seenModels.has(run)) continue
    seenModels.add(run)
    for (const role of ["fact_extract", "article_write"]) {
      const relative = `runs/${run}/model-policy/${role}/budget.json`,
        file = safePath(sourceRoot, relative)
      if (!fs.existsSync(file)) continue
      const ledger = read(file)
      for (const attempt of ledger.attempts.filter(
        (a) => a.status === "complete" && a.result?.output,
      )) {
        const request = attempt.result.artifacts?.request || attempt.request
        if (!request?.messages) throw Error("Original replay request bytes required: " + relative)
        const schema = request.schema || request.format
        exchanges.push({
          run,
          role,
          source: { path: relative, sha256: hash(file), attempt_id: attempt.id },
          request: { messages: request.messages, schema },
          output: attempt.result.output,
        })
      }
    }
    const claimsPath = safePath(sourceRoot, `runs/${run}/claims.json`)
    if (fs.existsSync(claimsPath)) {
      const claims = read(claimsPath)
      for (const s of claims.provenance?.sources || []) modelQueue.push(s.run)
      if (claims.provenance?.approval_run) modelQueue.push(claims.provenance.approval_run)
    }
    const facts = safePath(sourceRoot, `runs/${run}/selected-source-facts.json`)
    if (fs.existsSync(facts)) {
      const v = read(facts)
      if (v.result?.provenance?.approval_run) modelQueue.push(v.result.provenance.approval_run)
    }
  }
  const oracleFile = path.join(destination, "oracle.json")
  fs.writeFileSync(
    oracleFile,
    JSON.stringify(
      { schema: "research-recorded-processing-oracle/v1", articles: oracle, exchanges },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  )
  const inventory = [...files].sort().map((p) => ({
    path: p,
    sha256: hash(path.join(root, p)),
    bytes: fs.statSync(path.join(root, p)).size,
  }))
  const manifest = {
    schema: "research-processing-fixture/v1",
    selection,
    original_pool: originalSelection.pool,
    original_context: pool.context,
    source_repo: sourceRepo,
    source_root: sourceRoot,
    authority_vault: authorityVault,
    seed,
    articles: articleRuns.map((a) => ({
      candidate_id: a.candidate_id,
      writer_run: a.writer_run,
      action: a.action,
    })),
    files: inventory,
    oracle: { path: oracleFile, sha256: hash(oracleFile) },
    history_sha256: sha256(JSON.stringify(pool.history)),
    fresh_articles: fresh.size,
    preserved_reuse: articleRuns.length - fresh.size,
    production_writes: 0,
    model_calls: 0,
    fixture_rebasing:
      "absolute repository/vault/backlog paths only; native source and event IDs retained",
  }
  const file = path.join(destination, "manifest.json")
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 })
  return {
    path: file,
    sha256: hash(file),
    files: inventory.length,
    bytes: inventory.reduce((n, f) => n + f.bytes, 0),
    exchanges: exchanges.length,
    fresh_articles: fresh.size,
  }
}

export function materializeProcessingCode(source, destination) {
  source = fs.realpathSync(source)
  const files = implementationFiles(source).map((relative) => {
    const from = safePath(source, relative),
      to = safePath(destination, relative)
    if (fs.existsSync(to)) {
      if (hash(from) !== hash(to))
        throw Error("Private execution configuration differs from frozen code: " + relative)
    } else copyFile(from, to)
    fs.chmodSync(to, 0o444)
    return { path: relative, sha256: hash(to) }
  })
  const receipt = {
    schema: "research-private-processing-code/v1",
    source_repo: source,
    files,
    sha256: sha256(JSON.stringify(files)),
    installed_production_runtime: false,
  }
  fs.mkdirSync(path.join(destination, ".local"), { recursive: true })
  fs.writeFileSync(
    path.join(destination, ".local/processing-code.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  )
  const dependencies = path.join(source, "node_modules")
  if (fs.existsSync(dependencies) && !fs.existsSync(path.join(destination, "node_modules")))
    fs.symlinkSync(dependencies, path.join(destination, "node_modules"), "dir")
  return receipt
}

// Only a newly copied private case reaches this function. Preserve every
// original byte in a SHA-bound backup before removing its prior writer binds.
function resetPrivateWriterBindings(root, destination, original, fixture) {
  if (original.schema !== "research-processing-fixture/v1" || !Array.isArray(original.files) ||
      !Array.isArray(original.articles) || !original.selection?.path ||
      hash(safePath(root, original.selection.path)) !== original.selection.sha256)
    throw Error("Exact processing fixture selection required for writer reset")
  const selection = read(safePath(root, original.selection.path))
  if (!Array.isArray(selection.selected) || selection.selected.length !== original.articles.length)
    throw Error("Exact processing fixture article composition required")
  const inventory = new Map(original.files.map((file) => [file.path, file]))
  if (inventory.size !== original.files.length || new Set(original.articles.map((a) => a.candidate_id)).size !== original.articles.length ||
      new Set(original.articles.map((a) => a.writer_run)).size !== original.articles.length)
    throw Error("Distinct fixture inventory and writer identities required")
  const expected = [], reuse = [], keys = new Set(), targetPaths = new Set(), freshWriters = new Set()
  for (const item of selection.selected) {
    const article = original.articles.find((a) => a.candidate_id === item.candidate_id)
    if (!article || article.action !== item.action || !/^[A-Za-z0-9_-]+$/.test(article.writer_run || ""))
      throw Error("Fixture selected article identity changed")
    const planPath = item.execution?.plan?.path
    if (!planPath || !inventory.has(planPath) || hash(safePath(root, planPath)) !== item.execution.plan.sha256)
      throw Error("Fixture selected plan changed")
    const plan = read(safePath(root, planPath)),
      events = plan.events?.filter((event) => event.group_id === item.execution.group_id) || []
    if (events.length !== 1) throw Error("Exact fixture selected event required")
    const event = events[0], workKey = eventWorkKey(event)
    if (keys.has(workKey)) throw Error("Fixture event binding is shared with another selected article")
    keys.add(workKey)
    if (item.action === "reuse") {
      if (event.action !== "reuse" || event.prior?.run_id !== article.writer_run)
        throw Error("Fixture selected reuse no longer identifies its prior writer")
      const approvalPath = `runs/${article.writer_run}/approved-article.json`, approval = inventory.get(approvalPath)
      if (!approval || hash(safePath(root, approvalPath)) !== approval.sha256)
        throw Error("Fixture reused approval changed")
      reuse.push({ candidate_id: item.candidate_id, writer_run: article.writer_run, approval })
      continue
    }
    const writer = "event-" + sha256(JSON.stringify([item.execution.plan, item.execution.group_id])).slice(0, 36)
    if (writer !== article.writer_run || !["write", "update", "correction"].includes(event.action))
      throw Error("Fixture writer differs from its deterministic selected event")
    freshWriters.add(writer)
    const files = [
      `runs/${writer}/event-selection.json`,
      `event-selections/${writer}/input.json`,
      `event-selections/${writer}/selection.json`,
      `event-plans/${plan.run_id}/selections/${event.group_id}.json`,
      `event-work/${workKey}/selection.json`,
    ].map((relative) => {
      const file = inventory.get(relative)
      if (!file || !/^[a-f0-9]{64}$/.test(file.sha256 || "") || hash(safePath(root, relative)) !== file.sha256 || targetPaths.has(relative))
        throw Error("Fixture writer binding is missing, changed or shared: " + relative)
      targetPaths.add(relative)
      return { path: relative, sha256: file.sha256, backup_path: `.local/writer-binding-backup/${relative}` }
    })
    const pointer = read(safePath(root, files[0].path)), input = read(safePath(root, files[1].path)),
      selected = read(safePath(root, files[2].path)), planBinding = read(safePath(root, files[3].path)),
      globalBinding = read(safePath(root, files[4].path))
    const expectedInput = { schema: "research-event-selection-input/v1", run_id: writer,
      plan: item.execution.plan, group_id: event.group_id }
    if (!equal(input, expectedInput) || pointer.path !== files[2].path || pointer.sha256 !== files[2].sha256 ||
        selected.schema !== "research-event-selection/v1" || selected.run_id !== writer ||
        !equal(selected.plan, item.execution.plan) || selected.group_id !== event.group_id ||
        !equal(selected.sources, event.sources) || !equal(selected.identity, event.identity) ||
        !equal(selected.existing_event, event.prior) || selected.action !== event.action ||
        planBinding.writer_run !== writer || !equal(planBinding.selection, pointer) ||
        globalBinding.writer_run !== writer || !equal(globalBinding.selection, pointer) ||
        !equal(loadStoredSourceRun(root, selected.source_run).identity, selected.source_identity))
      throw Error("Fixture writer binding or stored source identity changed")
    for (const [dir, names] of [[`runs/${writer}`, ["event-selection.json"]],
      [`event-selections/${writer}`, ["input.json", "selection.json"]],
      [`event-work/${workKey}`, ["selection.json"]]])
      if (!equal(fs.readdirSync(safePath(root, dir)).sort(), names))
        throw Error("Fixture writer directory contains other or unrecoverable data: " + dir)
    expected.push({ candidate_id: item.candidate_id, writer_run: writer, plan: item.execution.plan,
      group_id: event.group_id, source_run: selected.source_run, source_identity: selected.source_identity,
      work_key: workKey, files })
  }
  if (expected.length !== original.fresh_articles || reuse.length !== original.preserved_reuse)
    throw Error("Fixture fresh and reused article counts changed")
  // A reference from another native binding is evidence of shared ownership.
  const expectedByWorkKey = new Map(expected.map((entry) => [entry.work_key, entry]))
  for (const file of original.files) {
    if (/^event-plans\/[^/]+\/plan\.json$/.test(file.path)) {
      const other = read(safePath(root, file.path))
      if (!Array.isArray(other.events)) throw Error("Fixture event plan is malformed")
      for (const event of other.events) {
        const owner = expectedByWorkKey.get(eventWorkKey(event))
        if (owner && (owner.plan.path !== file.path || owner.group_id !== event.group_id))
          throw Error("Fixture writer event is shared with another plan: " + file.path)
      }
    }
    if (!/^(?:event-plans\/[^/]+\/selections\/[^/]+\.json|event-work\/[^/]+\/selection\.json|runs\/[^/]+\/event-selection\.json)$/.test(file.path) || targetPaths.has(file.path)) continue
    const value = read(safePath(root, file.path))
    if (freshWriters.has(value.writer_run) || expected.some((entry) => value.path === entry.files[2].path))
      throw Error("Fixture writer binding is shared with another article: " + file.path)
  }
  for (const entry of expected) for (const file of entry.files) {
    const backup = safePath(destination, file.backup_path)
    copyFile(safePath(root, file.path), backup)
    if (hash(backup) !== file.sha256) throw Error("Fixture writer recovery backup changed")
  }
  const planPath = ".local/processing-writer-reset-plan.json", planFile = safePath(destination, planPath)
  fs.writeFileSync(planFile, JSON.stringify({ schema: "research-private-writer-reset-plan/v1", fixture,
    root, expected, reused_approvals: reuse }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  const planRef = { path: planPath, sha256: hash(planFile) }
  for (const entry of expected) {
    for (const file of entry.files) {
      if (hash(safePath(root, file.path)) !== file.sha256 || hash(safePath(destination, file.backup_path)) !== file.sha256)
        throw Error("Fixture writer binding changed before reset")
      fs.unlinkSync(safePath(root, file.path))
    }
    for (const dir of [`runs/${entry.writer_run}`, `event-selections/${entry.writer_run}`, `event-work/${entry.work_key}`])
      fs.rmdirSync(safePath(root, dir))
  }
  if (expected.some((entry) => entry.files.some((file) => fs.existsSync(safePath(root, file.path)))))
    throw Error("Fixture writer reset did not finish")
  const resultPath = ".local/processing-writer-reset.json", resultFile = safePath(destination, resultPath)
  fs.writeFileSync(resultFile, JSON.stringify({ schema: "research-private-writer-reset/v1", status: "reset",
    plan: planRef, fixture, removed_files: expected.reduce((n, entry) => n + entry.files.length, 0),
    preserved_reused_approvals: reuse.length }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  return { path: resultPath, sha256: hash(resultFile) }
}

// Re-created native binds must match the backed-up bytes and the original
// parsed-source identity. A subset can be checked for a private live sample.
export function verifyProcessingFixtureBindings(instance, { candidate_ids } = {}) {
  const root = instance.root, repo = instance.repo, resetRef = instance.writer_reset
  if (!resetRef || hash(safePath(repo, resetRef.path)) !== resetRef.sha256)
    throw Error("Private writer reset receipt changed")
  const reset = read(safePath(repo, resetRef.path))
  if (reset.schema !== "research-private-writer-reset/v1" || reset.status !== "reset" ||
      !equal(reset.fixture, instance.fixture) || hash(safePath(repo, reset.plan.path)) !== reset.plan.sha256)
    throw Error("Private writer reset plan changed")
  const plan = read(safePath(repo, reset.plan.path))
  if (plan.schema !== "research-private-writer-reset-plan/v1" || plan.root !== root || !equal(plan.fixture, instance.fixture))
    throw Error("Private writer reset root or fixture changed")
  const ids = candidate_ids === undefined ? plan.expected.map((entry) => entry.candidate_id) : candidate_ids
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some((id) => plan.expected.filter((entry) => entry.candidate_id === id).length !== 1))
    throw Error("Exact private writer verification candidates required")
  const verified = []
  for (const entry of plan.expected.filter((value) => ids.includes(value.candidate_id))) {
    for (const file of entry.files) {
      if (hash(safePath(repo, file.backup_path)) !== file.sha256 || hash(safePath(root, file.path)) !== file.sha256)
        throw Error("Regenerated writer binding or its recovery backup changed: " + file.path)
    }
    if (!equal(loadStoredSourceRun(root, entry.source_run).identity, entry.source_identity))
      throw Error("Regenerated writer source identity changed")
    verified.push({ candidate_id: entry.candidate_id, writer_run: entry.writer_run,
      binding_sha256: entry.files.map(({ path, sha256 }) => ({ path, sha256 })),
      source_identity: entry.source_identity })
  }
  for (const item of plan.reused_approvals)
    if (hash(safePath(root, item.approval.path)) !== item.approval.sha256)
      throw Error("Preserved prior approval changed")
  return { schema: "research-private-writer-verification/v1", reset: resetRef,
    verified_count: verified.length, preserved_reused_approvals: plan.reused_approvals.length, verified }
}

export function instantiateProcessingFixture(
  manifest,
  destination,
  { live = false, executionRepo = fileURLToPath(new URL("../../", import.meta.url)) } = {},
) {
  if (fs.existsSync(destination)) throw Error("Fresh benchmark case directory required")
  const original = read(manifest.path)
  if (hash(manifest.path) !== manifest.sha256) throw Error("Processing fixture manifest changed")
  if (!live) {
    const oracle = original.oracle
    const stat = typeof oracle?.path === "string" && path.isAbsolute(oracle.path)
      ? fs.lstatSync(oracle.path, { throwIfNoEntry: false }) : null
    if (!stat?.isFile() || stat.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(oracle?.sha256 || "") ||
        hash(oracle.path) !== oracle.sha256)
      throw Error("Processing fixture oracle changed")
  }
  copyFixtureTree(original.seed, destination, { reserveBytes: 2 * 1024 * 1024 * 1024 })
  const execution = materializeProcessingCode(executionRepo, destination)
  const root = path.join(destination, ".local/research/local-ai"),
    vault = path.join(destination, "vault")
  for (const f of original.files)
    if (hash(safePath(root, f.path)) !== f.sha256)
      throw Error("Fixture source bytes changed: " + f.path)
  for (const a of original.articles.filter((a) => a.action !== "reuse"))
    for (const name of [
      "claims.json",
      "reviewed-claims.json",
      "draft.json",
      "approved-article.json",
    ])
      if (fs.existsSync(safePath(root, `runs/${a.writer_run}/${name}`)))
        throw Error("A fresh processing case cannot start with completed article output")
  const writerReset = resetPrivateWriterBindings(root, destination, original, manifest)
  const poolPath = safePath(root, original.original_pool.path),
    pool = read(poolPath)
  pool.context = {
    repo: fs.realpathSync(destination),
    vault,
    backlog: path.join(destination, ".local/research/candidate-backlog.json"),
  }
  fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2) + "\n")
  const selectionPath = safePath(root, original.selection.path),
    selection = read(selectionPath)
  selection.pool.sha256 = hash(poolPath)
  fs.writeFileSync(selectionPath, JSON.stringify(selection, null, 2) + "\n")
  fs.mkdirSync(path.join(root, ".storage"), { recursive: true })
  fs.writeFileSync(
    path.join(root, ".storage/policy.json"),
    JSON.stringify({ schema: "research-cold-storage/v1", root, enabled: false }),
  )
  if (!live) {
    const copiedOracle = path.join(destination, ".local/replay-oracle.json")
    copyFile(original.oracle.path, copiedOracle)
    if (hash(copiedOracle) !== original.oracle.sha256)
      throw Error("Processing fixture oracle changed during copy")
  }
  const binding = {
    schema: "research-processing-fixture-instance/v1",
    fixture: manifest,
    root,
    repo: destination,
    vault,
    backlog: pool.context.backlog,
    policy: path.join(destination, "data/research-model-policy-codex.json"),
    selection: { path: original.selection.path, sha256: hash(selectionPath) },
    rebasing: [
      {
        path: original.original_pool.path,
        original_sha256: original.original_pool.sha256,
        instance_sha256: hash(poolPath),
      },
      {
        path: original.selection.path,
        original_sha256: original.selection.sha256,
        instance_sha256: hash(selectionPath),
      },
    ],
    live,
    execution_code: {
      source_repo: execution.source_repo,
      sha256: execution.sha256,
      files: execution.files.length,
    },
    imported_completed_new_articles: 0,
    imported_replay_oracle: !live,
    writer_reset: writerReset,
    ...(!live ? { replay_oracle_sha256: original.oracle.sha256 } : {}),
  }
  fs.writeFileSync(
    path.join(destination, ".local/processing-instance.json"),
    JSON.stringify(binding, null, 2) + "\n",
  )
  return binding
}
