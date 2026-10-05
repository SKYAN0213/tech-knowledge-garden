import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const id = (value) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value || "")) throw Error("Exact daily collection ID required")
  return value
}
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
const pinnedBytes = (root, ref) => {
  if (!/^[a-f0-9]{64}$/.test(ref?.sha256 || "")) throw Error("Pinned collection evidence required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Frozen collection evidence changed")
  return bytes
}
const createExact = (root, file, bytes) => {
  if (fs.existsSync(safePath(root, file))) {
    if (!fs.readFileSync(safePath(root, file)).equals(bytes))
      throw Error("Collection snapshot input changed")
  } else atomicCreate(root, file, bytes)
  return reference(root, file)
}

export function loadShadowCollectionInputs(root, dailyRun) {
  const file = `evaluation/shadow-inputs/${id(dailyRun)}/inputs.json`
  const input = readJSON(root, file)
  if (!input) return null
  if (
    input.schema !== "research-shadow-collection-inputs/v1" ||
    input.daily_run !== dailyRun ||
    !Array.isArray(input.sources) ||
    !input.sources.length ||
    !Array.isArray(input.active_routes) ||
    !input.active_routes.length ||
    new Set(input.sources.map((row) => row.original_path)).size !== input.sources.length ||
    sha256(input.sources.map((row) => `${row.original_path}:${row.sha256}`).join("\n")) !==
      input.config_sha256
  )
    throw Error("Exact frozen acquisition inputs required")
  for (const row of input.sources) pinnedBytes(root, row)
  pinnedBytes(root, input.config)
  const plan = JSON.parse(pinnedBytes(root, input.plan))
  if (
    input.config?.original_path === undefined ||
    !input.sources.some((row) => JSON.stringify(row) === JSON.stringify(input.config)) ||
    input.plan.path !== `daily/runs/${dailyRun}/plan.json` ||
    plan.run_id !== dailyRun ||
    plan.config_sha256 !== input.config_sha256
  )
    throw Error("Frozen configuration and plan binding changed")
  return { ...reference(root, file), value: input }
}

// Freeze implementation/configuration before any source request. Backlog and
// coverage belong to the later handoff snapshot, not this acquisition input.
export async function freezeShadowCollectionInputs({
  root,
  plan,
  activeRoutes,
  sourcePaths,
  configFile,
}) {
  const dailyRun = id(plan.run_id)
  return withLock(root, "shadow-inputs-" + dailyRun, () => {
    const previous = loadShadowCollectionInputs(root, dailyRun)
    const planRef = reference(root, `daily/runs/${dailyRun}/plan.json`)
    if (JSON.stringify(JSON.parse(pinnedBytes(root, planRef))) !== JSON.stringify(plan))
      throw Error("Exact stored acquisition plan required")
    if (previous) {
      if (
        previous.value.plan.sha256 !== planRef.sha256 ||
        previous.value.config_sha256 !== plan.config_sha256 ||
        JSON.stringify(previous.value.active_routes) !== JSON.stringify(activeRoutes)
      )
        throw Error("Acquisition snapshot belongs to different planning inputs")
      return { path: previous.path, sha256: previous.sha256 }
    }
    if (!sourcePaths.includes(configFile))
      throw Error("Planning configuration is not in the frozen source inputs")
    const inputs = sourcePaths.map((file) => ({ file, bytes: fs.readFileSync(file) }))
    const digest = (rows) =>
      sha256(rows.map((row) => `${row.file}:${sha256(row.bytes)}`).join("\n"))
    if (
      digest(inputs) !== plan.config_sha256 ||
      digest(sourcePaths.map((file) => ({ file, bytes: fs.readFileSync(file) }))) !==
        plan.config_sha256
    )
      throw Error("Acquisition inputs changed before collection; preserve this run")
    const prefix = `evaluation/shadow-inputs/${dailyRun}`
    const sources = inputs.map((row, index) => ({
      original_path: row.file,
      ...createExact(root, `${prefix}/files/${index}.bin`, row.bytes),
    }))
    const input = {
      schema: "research-shadow-collection-inputs/v1",
      daily_run: dailyRun,
      config_sha256: plan.config_sha256,
      plan: planRef,
      sources,
      config: sources.find((row) => row.original_path === configFile),
      active_routes: activeRoutes,
    }
    if (!input.config) throw Error("Planning configuration is not in the frozen source inputs")
    createExact(root, prefix + "/inputs.json", Buffer.from(JSON.stringify(input, null, 2) + "\n"))
    return reference(root, prefix + "/inputs.json")
  })
}

export function loadShadowHandoffBasis(root, ref) {
  const basis = JSON.parse(pinnedBytes(root, ref))
  if (basis.schema !== "research-shadow-collection-basis/v1" || basis.phase !== "handoff")
    throw Error("Exact handoff comparison basis required")
  const input = loadShadowCollectionInputs(root, basis.daily_run)
  if (
    !input ||
    input.sha256 !== basis.acquisition_inputs.sha256 ||
    input.path !== basis.acquisition_inputs.path ||
    basis.daily_run !== input.value.daily_run ||
    basis.config_sha256 !== input.value.config_sha256 ||
    JSON.stringify(basis.config) !== JSON.stringify(input.value.config) ||
    JSON.stringify(basis.plan) !== JSON.stringify(input.value.plan) ||
    basis.candidate_published !== false ||
    basis.comparison_completed !== false ||
    JSON.stringify(basis.sources) !== JSON.stringify(input.value.sources) ||
    JSON.stringify(basis.active_routes) !== JSON.stringify(input.value.active_routes)
  )
    throw Error("Handoff snapshot differs from frozen acquisition inputs")
  const handoff = JSON.parse(pinnedBytes(root, basis.handoff))
  const inputHash = sha256(JSON.stringify(handoff.inputs))
  if (
    ref.path !== `evaluation/shadow-bases/${basis.daily_run}/handoffs/${inputHash}/basis.json` ||
    handoff.schema !== "research-editorial-handoff/v1" ||
    basis.handoff.path !== `daily/runs/${basis.daily_run}/handoffs/${inputHash}.json` ||
    handoff.daily_run !== basis.daily_run ||
    handoff.inputs?.plan_sha256 !== input.value.plan.sha256 ||
    (basis.backlog?.sha256 || null) !== handoff.inputs?.backlog_sha256 ||
    (basis.coverage?.sha256 || null) !== handoff.inputs?.daily_coverage_sha256
  )
    throw Error("Handoff planning, backlog or coverage binding changed")
  const receipts = JSON.parse(pinnedBytes(root, basis.receipts))
  const summary = JSON.parse(pinnedBytes(root, basis.summary))
  if (
    !Array.isArray(receipts) ||
    sha256(JSON.stringify(receipts)) !== handoff.inputs.receipts_sha256 ||
    receipts.some((row) => row.daily_run !== basis.daily_run) ||
    summary.schema !== "research-daily-summary/v1" ||
    summary.run_id !== basis.daily_run ||
    summary.receipts !== receipts.length
  )
    throw Error("Frozen collection receipts and summary differ from handoff")
  if (basis.backlog) pinnedBytes(root, basis.backlog)
  if (basis.coverage) pinnedBytes(root, basis.coverage)
  return basis
}

// Each handoff gets its own snapshot. A later candidate approval can create a
// different handoff without replacing the prior evidence or rerunning sources.
export async function freezeShadowHandoffBasis({
  root,
  dailyRun,
  handoffPath,
  backlogFile,
  receipts,
}) {
  id(dailyRun)
  return withLock(root, "shadow-basis-" + dailyRun, () => {
    const inputs = loadShadowCollectionInputs(root, dailyRun)
    if (!inputs)
      throw Error(
        "Original acquisition input snapshot is missing; do not reconstruct it from current files",
      )
    const handoffRef = reference(root, handoffPath)
    const handoff = JSON.parse(pinnedBytes(root, handoffRef))
    const inputHash = sha256(JSON.stringify(handoff.inputs))
    const prefix = `evaluation/shadow-bases/${dailyRun}/handoffs/${inputHash}`
    const file = prefix + "/basis.json"
    if (
      handoff.schema !== "research-editorial-handoff/v1" ||
      handoff.daily_run !== dailyRun ||
      handoff.inputs?.plan_sha256 !== inputs.value.plan.sha256 ||
      handoffPath !== `daily/runs/${dailyRun}/handoffs/${inputHash}.json`
    )
      throw Error("Exact source-bound daily handoff required")
    const point = (ref) =>
      atomicWrite(root, `daily/runs/${dailyRun}/shadow-basis.json`, {
        schema: "research-shadow-basis-pointer/v1",
        daily_run: dailyRun,
        handoff: handoffRef,
        basis: ref,
        candidate_published: false,
        comparison_completed: false,
      })
    const previous = readJSON(root, file)
    if (previous) {
      const ref = reference(root, file)
      loadShadowHandoffBasis(root, ref)
      point(ref)
      return ref
    }
    const capture = (from, name, expected) => {
      const exists = fs.existsSync(from)
      if (expected === null && !exists) return null
      if (!exists) throw Error("Handoff input disappeared before capture")
      const bytes = fs.readFileSync(from)
      if (sha256(bytes) !== expected)
        throw Error(
          "Handoff input changed before capture; regenerate handoff without collecting again",
        )
      return createExact(root, prefix + "/" + name, bytes)
    }
    if (
      !Array.isArray(receipts) ||
      sha256(JSON.stringify(receipts)) !== handoff.inputs.receipts_sha256 ||
      receipts.some((row) => row.daily_run !== dailyRun)
    )
      throw Error("Exact collection receipts required before handoff capture")
    const summaryBytes = fs.readFileSync(safePath(root, `daily/runs/${dailyRun}/summary.json`))
    const summary = JSON.parse(summaryBytes)
    if (
      summary.schema !== "research-daily-summary/v1" ||
      summary.run_id !== dailyRun ||
      summary.receipts !== receipts.length
    )
      throw Error("Exact completed collection summary required")
    const basis = {
      ...inputs.value,
      schema: "research-shadow-collection-basis/v1",
      phase: "handoff",
      acquisition_inputs: { path: inputs.path, sha256: inputs.sha256 },
      handoff: handoffRef,
      receipts: createExact(
        root,
        prefix + "/receipts.json",
        Buffer.from(JSON.stringify(receipts) + "\n"),
      ),
      summary: createExact(root, prefix + "/summary.json", summaryBytes),
      backlog: capture(backlogFile, "backlog.json", handoff.inputs?.backlog_sha256),
      coverage: capture(
        safePath(root, "daily/route-coverage.json"),
        "coverage.json",
        handoff.inputs?.daily_coverage_sha256,
      ),
      candidate_published: false,
      comparison_completed: false,
    }
    createExact(root, file, Buffer.from(JSON.stringify(basis, null, 2) + "\n"))
    const ref = reference(root, file)
    loadShadowHandoffBasis(root, ref)
    point(ref)
    return ref
  })
}
